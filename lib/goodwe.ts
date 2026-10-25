import { ModbusTcpClient } from "./modbus-tcp";
import { ConnectionSettings, DeviceInfo, RuntimeData } from "./types";

// Register map for the GoodWe DT/MS/D-NS/XS (G3) family, which includes the
// GW5000-DNS series. Addresses are Modbus holding-register numbers (30001 = 0x7531).
// Source: marcelblijleven/goodwe (goodwe/dt.py) and the GoodWe G3 Modbus protocol.
const DEVICE_INFO_START = 30001;
const DEVICE_INFO_COUNT = 40;
const RUNTIME_START = 30103;
const RUNTIME_COUNT = 40;

// Byte offsets inside the response buffers (register address - start) * 2.
const SERIAL_OFFSET = (30004 - DEVICE_INFO_START) * 2; // 8 registers
const SERIAL_LENGTH = 16;
const DSP1_OFFSET = (30034 - DEVICE_INFO_START) * 2;
const DSP2_OFFSET = (30035 - DEVICE_INFO_START) * 2;
const ARM_OFFSET = (30036 - DEVICE_INFO_START) * 2;

const PV1_VOLTAGE_OFFSET = (30103 - RUNTIME_START) * 2;
const PV1_CURRENT_OFFSET = (30104 - RUNTIME_START) * 2;
const PV2_VOLTAGE_OFFSET = (30105 - RUNTIME_START) * 2;
const PV2_CURRENT_OFFSET = (30106 - RUNTIME_START) * 2;
const GRID_VOLTAGE_OFFSET = (30118 - RUNTIME_START) * 2;
const TOTAL_POWER_OFFSET = (30127 - RUNTIME_START) * 2; // U32
const WORK_MODE_OFFSET = (30129 - RUNTIME_START) * 2;
const TEMPERATURE_OFFSET = (30141 - RUNTIME_START) * 2; // S16, 0.1 °C

const WORK_MODES: Record<number, string> = {
  0: "Wait",
  1: "Normal",
  2: "Error",
  4: "Check",
};

function readVoltageOrCurrent(buffer: Buffer, offset: number): number {
  const raw = buffer.readUInt16BE(offset);
  return raw === 0xffff ? 0 : raw / 10;
}

export function createClient(connection: ConnectionSettings): ModbusTcpClient {
  return new ModbusTcpClient(
    connection.ip_address,
    Number(connection.port),
    Number(connection.modbus_id)
  );
}

export async function readDeviceInfo(
  connection: ConnectionSettings
): Promise<DeviceInfo> {
  const client = createClient(connection);
  const buffer = await client.readHoldingRegisters(
    DEVICE_INFO_START,
    DEVICE_INFO_COUNT
  );

  const serialNumber = buffer
    .subarray(SERIAL_OFFSET, SERIAL_OFFSET + SERIAL_LENGTH)
    .toString("ascii")
    .replace(/\0/g, "")
    .trim();

  const dsp1 = buffer.readUInt16BE(DSP1_OFFSET);
  const dsp2 = buffer.readUInt16BE(DSP2_OFFSET);
  const arm = buffer.readUInt16BE(ARM_OFFSET);
  const firmware = `${dsp1}.${dsp2}.${arm.toString(16).padStart(2, "0")}`;

  if (!serialNumber) {
    throw new Error("Inverter did not return a serial number");
  }

  return { serialNumber, firmware };
}

export async function readRuntimeData(
  connection: ConnectionSettings
): Promise<RuntimeData> {
  const client = createClient(connection);
  const buffer = await client.readHoldingRegisters(
    RUNTIME_START,
    RUNTIME_COUNT
  );

  const pv1Power = Math.round(
    readVoltageOrCurrent(buffer, PV1_VOLTAGE_OFFSET) *
      readVoltageOrCurrent(buffer, PV1_CURRENT_OFFSET)
  );
  const pv2Power = Math.round(
    readVoltageOrCurrent(buffer, PV2_VOLTAGE_OFFSET) *
      readVoltageOrCurrent(buffer, PV2_CURRENT_OFFSET)
  );

  const rawTemperature = buffer.readInt16BE(TEMPERATURE_OFFSET);
  const temperature =
    rawTemperature === -1 || rawTemperature === 32767
      ? null
      : rawTemperature / 10;

  const workMode = buffer.readUInt16BE(WORK_MODE_OFFSET);

  return {
    totalPower: buffer.readUInt32BE(TOTAL_POWER_OFFSET),
    pv1Power,
    pv2Power,
    gridVoltage: readVoltageOrCurrent(buffer, GRID_VOLTAGE_OFFSET),
    temperature,
    status: WORK_MODES[workMode] ?? `Unknown (${workMode})`,
  };
}
