# ORION Radios

A local workspace for one AP and one or more MikroTik Stations, with three tabs: Equipment, Link and Tests. RouterBoard network and LoRa tools remain in their [separate workspace](../routerboards/README.md).

## Start and connect

Follow the [root setup](../README.md), then run `start-orion.cmd`. For frontend development, run `npm run dev` in `shared/frontend` and open `http://localhost:5174`. Enter `demo` to explore without hardware; demo mode does not apply changes.

Select a discovered radio or enter its existing IP. No factory address is assumed; an unannounced IP does not prove that the device has none. MAC preparation requires valid credentials and permitted device services. It reviews changes before adding an IP for API access. The MAC session ends, but the added IP remains.

## Configure the link

Start with the AP, review the proposed changes and confirm. After reconnecting and checking saved fields, continue with the Station. Choose a dedicated pair by default, multiple Stations when needed, or an existing AP to configure only its client. To adjust an existing device alone, use the individual-radio path.

Existing management addresses and bridges are retained when possible. Suggested IPs are editable and are not checked for availability across the network. If AP and Station addresses belong to different subnets, review routing or choose an appropriate address.

Failed readback does not advance the session. Retry verification without writing again; after a failed write, reconnect and inspect the device before requesting another review. Ending the session invalidates its pending confirmation.

## Check the result

Confirm the remote MAC and authorization, then test its actual IP and a device beyond the link. Repeat for each Station. Finishing setup retains only a temporary, password-free endpoint summary; selecting an endpoint fills the ping form without starting a test.

Alignment records valid signal readings and lets the technician choose the Station followed by sound. Missing readings and failed updates are not reported as a healthy link. Monitoring pauses and configuration tabs are blocked if hardware identity cannot be confirmed.

Readback confirms readable settings, not credentials, RF performance or the path taken by a ping. See the [validation status](../docs/MVP-VALIDATION.md) for pending physical and visual checks, and the [field manual](../docs/manual-de-campo.md) for the bench procedure.

## Source

`workspace.mjs` selects the radio navigation and dedicated components in `frontend/`. Configuration, alignment and API access live in `shared/`, with the RouterBoard workflow kept separate.
