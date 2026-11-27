export type ModbusProtocol = "tcp" | "udp";

export type ConnectionSettings = {
  ip_address: string;
  protocol: ModbusProtocol;
  port: number;
  modbus_id: number;
};

export interface ModbusClient {
  readHoldingRegisters(startAddress: number, count: number): Promise<Buffer>;
}

export type PairSettings = ConnectionSettings & {
  poll_interval: number;
};

export type DeviceInfo = {
  serialNumber: string;
  firmware: string;
};

export type RuntimeData = {
  totalPower: number;
  pv1Power: number;
  pv2Power: number;
  gridVoltage: number;
  temperature: number | null;
  dailyEnergy: number;
  totalEnergy: number | null;
  status: string;
};
