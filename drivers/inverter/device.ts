import Homey from "homey";
import {
  DEFAULT_MAX_AC_POWER_W,
  MAX_AC_POWER_STORE_KEY,
  createClient,
  readDeviceInfo,
  readMaxAcPower,
  readRuntimeData,
} from "../../lib/goodwe";
import { ConnectionSettings, RuntimeData } from "../../lib/types";

const DEFAULT_POLL_INTERVAL_MINUTES = 5;
const MIN_POLL_INTERVAL_MINUTES = 1;

class InverterDevice extends Homey.Device {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  // Readings above the inverter's rated AC output are invalid (e.g. a bad
  // 32-bit register read) and are ignored. Set from the store at init.
  private maxAcPower = DEFAULT_MAX_AC_POWER_W;

  // Homey does not automatically add newly declared capabilities to devices
  // that were paired before the capability existed.
  private async syncCapabilities() {
    const capabilities = [
      "measure_power",
      "goodwe_pv1_power",
      "goodwe_pv2_power",
      "measure_voltage",
      "measure_temperature",
      "goodwe_status",
      "goodwe_firmware",
      "goodwe_errormsg",
    ];

    for (const capability of capabilities) {
      if (!this.hasCapability(capability)) {
        this.log(`Adding missing capability ${capability}`);
        await this.addCapability(capability).catch(this.error);
      }
    }
  }

  private get connection(): ConnectionSettings {
    return {
      ip_address: String(this.getSetting("ip_address")),
      port: Number(this.getSetting("port") ?? 502),
      modbus_id: Number(this.getSetting("modbus_id") ?? 1),
    };
  }

  private get pollIntervalMs(): number {
    // Devices paired before this setting existed have no value, so use the default.
    const minutes = Number(
      this.getSetting("poll_interval") ?? DEFAULT_POLL_INTERVAL_MINUTES
    );
    const safeMinutes = Number.isFinite(minutes)
      ? Math.max(MIN_POLL_INTERVAL_MINUTES, minutes)
      : DEFAULT_POLL_INTERVAL_MINUTES;
    return safeMinutes * 60 * 1000;
  }

  private async updateCapabilityValues(data: RuntimeData) {
    if (data.totalPower <= this.maxAcPower) {
      await this.setCapabilityValue("measure_power", data.totalPower).catch(
        this.error
      );
    } else {
      this.error(
        `Ignoring invalid total power reading: ${data.totalPower} W exceeds ${this.maxAcPower} W`
      );
    }
    await this.setCapabilityValue("goodwe_pv1_power", data.pv1Power).catch(
      this.error
    );
    await this.setCapabilityValue("goodwe_pv2_power", data.pv2Power).catch(
      this.error
    );
    await this.setCapabilityValue("measure_voltage", data.gridVoltage).catch(
      this.error
    );
    await this.setCapabilityValue("goodwe_status", data.status).catch(
      this.error
    );
    if (data.temperature !== null) {
      await this.setCapabilityValue(
        "measure_temperature",
        data.temperature
      ).catch(this.error);
    }
  }

  // The inverter powers off at night, so an unreachable inverter is expected.
  // Report zero output and store the reason in goodwe_errormsg instead of
  // marking the device unavailable.
  private async updateErrorValues(message: string) {
    for (const capability of [
      "measure_power",
      "goodwe_pv1_power",
      "goodwe_pv2_power",
      "measure_voltage",
    ]) {
      await this.setCapabilityValue(capability, 0).catch(this.error);
    }
    await this.setCapabilityValue("goodwe_errormsg", message).catch(this.error);
  }

  private async poll() {
    // Avoid overlapping requests if the inverter responds slowly.
    if (this.polling) return;
    this.polling = true;

    try {
      const data = await readRuntimeData(this.connection);
      await this.updateCapabilityValues(data);
      await this.setCapabilityValue("goodwe_errormsg", "").catch(this.error);
      await this.setAvailable().catch(this.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error("Failed to read inverter data", err);
      await this.updateErrorValues(message);
      await this.setAvailable().catch(this.error);
    } finally {
      this.polling = false;
    }
  }

  private startPolling() {
    this.stopPolling();
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Devices paired before the rated power was stored have no value yet.
  private async loadMaxAcPower() {
    const stored = this.getStoreValue(MAX_AC_POWER_STORE_KEY);
    if (typeof stored === "number") {
      this.maxAcPower = stored;
      return;
    }

    // Only store a successful read, so a failure is retried on the next start.
    try {
      this.maxAcPower = await readMaxAcPower(this.connection);
      await this.setStoreValue(MAX_AC_POWER_STORE_KEY, this.maxAcPower);
    } catch (err) {
      this.error("Could not read rated power, using default", err);
      this.maxAcPower = DEFAULT_MAX_AC_POWER_W;
    }
  }

  async onInit() {
    await this.syncCapabilities();
    await this.loadMaxAcPower();

    // Firmware changes rarely, so it is read once at startup.
    try {
      const info = await readDeviceInfo(this.connection);
      await this.setCapabilityValue("goodwe_firmware", info.firmware).catch(
        this.error
      );
    } catch (err) {
      this.error("Could not read firmware version", err);
    }

    this.startPolling();
  }

  async onSettings({
    changedKeys,
  }: {
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<void> {
    if (
      changedKeys.some((key) =>
        ["ip_address", "port", "modbus_id", "poll_interval"].includes(key)
      )
    ) {
      this.log("Connection or polling settings changed, restarting polling");
      this.startPolling();
    }
  }

  onDeleted() {
    this.stopPolling();
  }
}

module.exports = InverterDevice;
