# Kiosks are device identities, not adult sessions

Wall tablets need a long-lived signed-in state that adults can revoke from Settings, without borrowing an adult's account or permissions.

Kiosks are `family_members` with role `kiosk`, authenticated by `session_type = kiosk`. They are filtered out of people lists and never get a Vikunja project. Pairing uses a short-lived token (QR or URL); the resulting session lasts until an adult revokes it.

**Considered**: overlaying kiosk permissions on an adult's session. That would make revoke/logout tangle with the adult's own logins, and a wall tablet would inherit admin rights.
