# GoodWe for Homey

Monitor your GoodWe solar inverter from Homey via Modbus TCP.

The app reads runtime data from the inverter over the local network and exposes it as a device in Homey:

- Current power (total AC output)
- PV string 1 and PV string 2 power
- Grid voltage
- Inverter temperature
- Status (for example Wait, Normal, Error, Check)
- Firmware version

The app only reads from the inverter. It does not write any settings to it.

## Requirements

- A GoodWe inverter with Modbus TCP enabled. The inverter must be reachable on your local network, for example through its built-in LAN or Wi-Fi communication module. The app defaults to TCP port `502` and Modbus ID `1`.
- A Homey with firmware `>=5.0.0` on the same local network as the inverter (the app uses the `local` platform and LAN connectivity).
- [Node.js](https://nodejs.org/) (current LTS recommended) and npm.
- A Homey developer account, used by the Homey CLI to run the app on your Homey.

### Tested hardware

This app has **only been tested with the GoodWe GW5000-DNS-30** using the **WiFi/LAN Kit-20** module. The register map in `lib/goodwe.ts` is written for the GoodWe DT/MS/D-NS/XS (G3) family, so other models may work, but they are untested. If you use another model, please report your results via the issue tracker.

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/knippers/eu.knippers.goodwe.git
cd eu.knippers.goodwe
```

### 2. Install dependencies

```bash
npm install
```

This installs the Homey CLI (the `homey` package), the TypeScript compiler, the Homey SDK type declarations (`@types/homey`), and ESLint. `package-lock.json` is not committed to the repository, so npm resolves the latest versions allowed by `package.json`.

### 3. Install the Homey SDK type declarations

The type declarations are installed as part of `npm install`. If they are missing or you want to refresh them, run:

```bash
npx homey app add-types
```

### 4. Build

```bash
npm run build
```

This compiles the TypeScript sources (`app.ts`, `drivers/`, `lib/`) into the `.homeybuild/` folder. That folder is generated output and is git-ignored.

Optionally, lint the code:

```bash
npm run lint
```

### 5. Run on your Homey

Log in with your Athom account once:

```bash
npx homey login
```

Then start the app in development mode:

```bash
npx homey app run
```

The CLI installs the app on the Homey you have selected and keeps it running, streaming logs to your terminal. Press `Ctrl+C` to stop it. If you have more than one Homey, use `npx homey select` to choose the one to use.

### 6. Add the inverter

1. In the Homey app, go to **Devices**, press **+**, and choose **GoodWe**.
2. Choose **Inverter**.
3. Enter the inverter's **IP address**. Leave **TCP port** at `502` and **Modbus ID** at `1` unless your setup differs.
4. Press **Check connection**. On success, the app shows the serial number and firmware version.
5. Press **Continue** and add the device.

The inverter is polled every 5 minutes by default. You can change the polling interval (minimum 1 minute), IP address, port, or Modbus ID later in the device settings.

## Project structure

| Path | Purpose |
| --- | --- |
| `app.ts` | App entry point |
| `drivers/inverter/` | Driver (pairing) and device (polling) logic |
| `lib/modbus-tcp.ts` | Minimal Modbus TCP client (function code 0x03) |
| `lib/goodwe.ts` | GoodWe register map and data decoding |
| `.homeycompose/` | Source files for the app manifest and capabilities |
| `app.json` | Generated from `.homeycompose/`. Edit the files in `.homeycompose/` instead. |

## Troubleshooting

- **Check connection fails:** Confirm the Homey and the inverter are on the same network, the IP address is correct, and the TCP port and Modbus ID match the inverter's Modbus TCP settings. Check that the inverter accepts Modbus TCP connections on that port, for example with a Modbus client on another machine.
- **Device shows unavailable:** The app marks the device unavailable when a read fails or times out (5 second timeout). The reason is shown on the device.

## License

Not specified yet.

## Author

Daniel Knippers ([daniel@knippers.eu](mailto:daniel@knippers.eu))
