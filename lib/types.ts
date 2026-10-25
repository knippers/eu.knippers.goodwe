export type ConnectionSettings = {
  ip_address: string;
  port: number;
  modbus_id: number;
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
  status: string;
};
