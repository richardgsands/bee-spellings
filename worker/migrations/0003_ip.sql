-- Network address of the device, for the per-device/IP breakdown on the dashboard.
ALTER TABLE checks ADD COLUMN ip TEXT;
ALTER TABLE events ADD COLUMN ip TEXT;
