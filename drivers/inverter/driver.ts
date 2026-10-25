import Homey from "homey";
import { readDeviceInfo } from "../../lib/goodwe";
import { ConnectionSettings } from "../../lib/types";

class InverterDriver extends Homey.Driver {
  async onInit() {
    this.log("Inverter driver has been initialized");
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let connection: ConnectionSettings | null = null;

    // Called by the "Check connection" button on the pair page.
    session.setHandler(
      "connect",
      async (data: ConnectionSettings): Promise<string> => {
        // Clear any previous successful check so a failed check cannot reuse it.
        connection = null;
        const settings = normalizeConnection(data);
        const info = await readDeviceInfo(settings);
        connection = settings;
        return `GoodWe ${info.serialNumber} (firmware ${info.firmware}) found!`;
      }
    );

    // Called when the user presses "Next" after the connection check.
    session.setHandler("list_devices", async () => {
      if (!connection) {
        throw new Error("Check the connection before continuing");
      }

      const info = await readDeviceInfo(connection);

      return [
        {
          name: `GoodWe ${info.serialNumber}`,
          data: { id: info.serialNumber },
          settings: { ...connection },
        },
      ];
    });
  }
}

function normalizeConnection(data: ConnectionSettings): ConnectionSettings {
  const ip_address = (data.ip_address ?? "").trim();
  const port = Number(data.port ?? 502);
  const modbus_id = Number(data.modbus_id ?? 1);

  if (!ip_address) throw new Error("IP address is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("TCP port must be between 1 and 65535");
  }
  if (!Number.isInteger(modbus_id) || modbus_id < 1 || modbus_id > 247) {
    throw new Error("Modbus ID must be between 1 and 247");
  }

  return { ip_address, port, modbus_id };
}

module.exports = InverterDriver;
