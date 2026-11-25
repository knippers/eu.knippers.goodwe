import * as dgram from "dgram";
import { ModbusClient } from "./types";

const FUNC_READ_HOLDING = 0x03;
const FUNC_EXCEPTION_FLAG = 0x80;
const DEFAULT_TIMEOUT_MS = 5000;
// UDP does not guarantee delivery, so a request is sent up to this many times.
const ATTEMPTS = 3;

/**
 * Modbus over UDP, as spoken by GoodWe inverters on port 8899. Requests are
 * Modbus RTU frames with a CRC-16 checksum. Responses start with 0xAA 0x55.
 */
export class ModbusUdpClient implements ModbusClient {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly unitId: number,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  /**
   * Reads holding registers (function code 0x03) and returns the raw
   * big-endian register payload as a Buffer (2 bytes per register).
   */
  public async readHoldingRegisters(
    startAddress: number,
    count: number
  ): Promise<Buffer> {
    const request = Buffer.alloc(8);
    request.writeUInt8(this.unitId, 0);
    request.writeUInt8(FUNC_READ_HOLDING, 1);
    request.writeUInt16BE(startAddress, 2);
    request.writeUInt16BE(count, 4);
    request.writeUInt16LE(crc16(request.subarray(0, 6)), 6);

    const response = await this.exchange(request);
    return parseReadResponse(response, count);
  }

  private async exchange(request: Buffer): Promise<Buffer> {
    const attemptTimeoutMs = Math.floor(this.timeoutMs / ATTEMPTS);
    let lastError: Error = new Error("Modbus UDP request was not sent");

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        return await this.sendOnce(request, attemptTimeoutMs);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError;
  }

  private sendOnce(request: Buffer, timeoutMs: number): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      let settled = false;
      let timer: NodeJS.Timeout | null = null;

      const finish = (err: Error | null, data?: Buffer) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        socket.close();
        if (err) reject(err);
        else resolve(data as Buffer);
      };

      timer = setTimeout(
        () => finish(new Error(`Modbus UDP timeout after ${timeoutMs} ms`)),
        timeoutMs
      );
      socket.on("error", (err) => finish(err));
      socket.on("message", (data: Buffer) => finish(null, data));
      socket.send(request, this.port, this.host, (err) => {
        if (err) finish(err);
      });
    });
  }
}

/**
 * Validates a UDP response and returns its register payload.
 * Read response: 0xAA 0x55, unit, function, byte count, payload, CRC-16.
 * Exception response: 0xAA 0x55, unit, function | 0x80, exception code, CRC-16.
 */
function parseReadResponse(response: Buffer, count: number): Buffer {
  if (response.length < 5 || response[0] !== 0xaa || response[1] !== 0x55) {
    throw new Error("Invalid Modbus UDP response header");
  }

  const functionCode = response[3];
  const isException = (functionCode & FUNC_EXCEPTION_FLAG) !== 0;
  const frameLength = isException ? 7 : response[4] + 7;
  if (response.length < frameLength) {
    throw new Error("Incomplete Modbus UDP response");
  }

  const crcOffset = frameLength - 2;
  if (
    crc16(response.subarray(2, crcOffset)) !==
    response.readUInt16LE(crcOffset)
  ) {
    throw new Error("Modbus UDP response CRC mismatch");
  }

  if (isException) {
    throw new Error(
      `Modbus exception ${response[4]} for function ${
        functionCode & ~FUNC_EXCEPTION_FLAG
      }`
    );
  }
  if (functionCode !== FUNC_READ_HOLDING) {
    throw new Error(`Unexpected Modbus function ${functionCode}`);
  }

  const byteCount = response[4];
  if (byteCount !== count * 2) {
    throw new Error(
      `Unexpected Modbus byte count ${byteCount}, expected ${count * 2}`
    );
  }

  return response.subarray(5, 5 + byteCount);
}

// Modbus CRC-16 (polynomial 0xA001, initial value 0xFFFF).
function crc16(data: Buffer): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x0001 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}
