import * as net from "net";

const FUNC_READ_HOLDING = 0x03;
const DEFAULT_TIMEOUT_MS = 5000;

export class ModbusTcpClient {
  private transactionId = 0;

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
    const request = Buffer.alloc(12);
    this.transactionId = (this.transactionId + 1) & 0xffff;
    request.writeUInt16BE(this.transactionId, 0);
    request.writeUInt16BE(0x0000, 2); // protocol id
    request.writeUInt16BE(6, 4); // remaining length
    request.writeUInt8(this.unitId, 6);
    request.writeUInt8(FUNC_READ_HOLDING, 7);
    request.writeUInt16BE(startAddress, 8);
    request.writeUInt16BE(count, 10);

    const response = await this.exchange(request);

    const functionCode = response.readUInt8(7);
    if (functionCode & 0x80) {
      throw new Error(
        `Modbus exception ${response.readUInt8(8)} for function ${
          functionCode & 0x7f
        }`
      );
    }

    const byteCount = response.readUInt8(8);
    if (byteCount !== count * 2) {
      throw new Error(
        `Unexpected Modbus byte count ${byteCount}, expected ${count * 2}`
      );
    }

    return response.subarray(9, 9 + byteCount);
  }

  private exchange(request: Buffer): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const socket = new net.Socket();
      let buffer = Buffer.alloc(0);
      let settled = false;

      const finish = (err: Error | null, data?: Buffer) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve(data as Buffer);
      };

      socket.setTimeout(this.timeoutMs);
      socket.on("timeout", () =>
        finish(new Error(`Modbus timeout after ${this.timeoutMs} ms`))
      );
      socket.on("error", (err) => finish(err));
      socket.on("close", () =>
        finish(new Error("Modbus connection closed before full response"))
      );

      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length < 9) return;

        const expected = 6 + buffer.readUInt16BE(4);
        if (buffer.length >= expected) {
          finish(null, buffer.subarray(0, expected));
        }
      });

      socket.connect(this.port, this.host, () => {
        socket.write(request);
      });
    });
  }
}
