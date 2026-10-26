import Homey from "homey";
import { createClient, readDeviceInfo, readRuntimeData } from "../../lib/goodwe";
import { ConnectionSettings, RuntimeData } from "../../lib/types";

const DEFAULT_POLL_INTERVAL_MINUTES = 5;
const MIN_POLL_INTERVAL_MINUTES = 1;

class InverterDevice extends Homey.Device {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

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
    await this.setCapabilityValue("measure_power", data.totalPower).catch(
      this.error
    );
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

  private async poll() {
    // Avoid overlapping requests if the inverter responds slowly.
    if (this.polling) return;
    this.polling = true;

    try {
      const data = await readRuntimeData(this.connection);
      await this.updateCapabilityValues(data);
      await this.setAvailable().catch(this.error);
    } catch (err) {
      this.error("Failed to read inverter data", err);
      await this.setUnavailable(
        err instanceof Error ? err.message : String(err)
      ).catch(this.error);
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

  async onInit() {
    await this.syncCapabilities();

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
