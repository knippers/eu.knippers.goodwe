import Homey from "homey";
import {
  DEFAULT_MAX_AC_POWER_W,
  MAX_AC_POWER_STORE_KEY,
  readDeviceInfo,
  readMaxAcPower,
} from "../../lib/goodwe";
import { PairSettings } from "../../lib/types";

const DEFAULT_POLL_INTERVAL_MINUTES = 5;
const MIN_POLL_INTERVAL_MINUTES = 1;

class InverterDriver extends Homey.Driver {
  async onInit() {
    this.log("Inverter driver has been initialized");
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let connection: PairSettings | null = null;
    let maxAcPower = DEFAULT_MAX_AC_POWER_W;

    // Called by the "Check connection" button on the pair page.
    session.setHandler(
      "connect",
      async (data: PairSettings): Promise<string> => {
        // Clear any previous successful check so a failed check cannot reuse it.
        connection = null;
        const settings = normalizeConnection(data);
        const info = await readDeviceInfo(settings);
        // A failed rated-power read should not block pairing; use the fallback.
        maxAcPower = await readMaxAcPower(settings).catch((err: unknown) => {
          this.log("Could not read rated power, using default", err);
          return DEFAULT_MAX_AC_POWER_W;
        });
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
          store: { [MAX_AC_POWER_STORE_KEY]: maxAcPower },
        },
      ];
    });
  }
}

function normalizeConnection(data: PairSettings): PairSettings {
  const ip_address = (data.ip_address ?? "").trim();
  const port = Number(data.port ?? 502);
  const modbus_id = Number(data.modbus_id ?? 1);
  const poll_interval = Number(
    data.poll_interval ?? DEFAULT_POLL_INTERVAL_MINUTES
  );

  if (!ip_address) throw new Error("IP address is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("TCP port must be between 1 and 65535");
  }
  if (!Number.isInteger(modbus_id) || modbus_id < 1 || modbus_id > 247) {
    throw new Error("Modbus ID must be between 1 and 247");
  }
  if (!Number.isFinite(poll_interval) || poll_interval < MIN_POLL_INTERVAL_MINUTES) {
    throw new Error(
      `Polling interval must be at least ${MIN_POLL_INTERVAL_MINUTES} minute`
    );
  }

  return { ip_address, port, modbus_id, poll_interval };
}

module.exports = InverterDriver;
