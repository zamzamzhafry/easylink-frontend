# Daily Operator Guide — Fetch, Store, Send

**What this does:** pull attendance/scan logs off the device, save them on this
Windows PC, then send them to the server (`192.168.1.129`).

You only need this Windows PC. Do the steps **in order**. Each step says what a
good result looks like. If a step does not look right, **stop and send a photo /
copy of the screen** — do not continue.

> Tip: every command below is one line. Copy the whole line, paste, press Enter.

---

## Before you start (one time per session)

1. Make sure the **device is plugged in / on the network**.
2. Make sure this PC is on the **same network/VPN** as the server.

That's it. No installing anything.

---

## Step 1 — Check the link to the server

This makes sure the PC can talk to the server **before** you send anything.

1. Open **PowerShell** (Start menu → type `PowerShell` → click it).
2. Go to the EasyLink folder. Type this and press Enter
   (adjust the path if your folder is somewhere else):

   ```powershell
   cd C:\Users\USER\Desktop\easylink-frontend
   ```

3. Run the link check:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\ops\fservice-sync\handshake-test.ps1
   ```

**Good result:** you see three green **[PASS]** lines and at the bottom:

```
Safe to run real sync now: ...php.exe ops\fservice-sync\sync.php
```

**If you see a red [FAIL]:** stop. Copy the red text and send it. Common ones:

| Red message says…                 | What it means                          |
|-----------------------------------|----------------------------------------|
| `HOP_B_AUTH_TOKEN ... not set`    | The password to the server is missing. |
| `Cannot reach 192.168.1.129`      | Network/VPN is off, or server is down. |
| `stale build` / `route missing`   | Server needs updating (tell the admin).|

---

## Step 2 — Fetch from the device + store on this PC

1. Open the EasyLink folder in **File Explorer**:
   `ops\fservice-sync\`
2. **Double-click `run.bat`.**
3. A black window opens and walks through 4 steps automatically:
   - starts the device service (FService)
   - tests the device connection
   - opens the **Control Panel** in your web browser
4. In the browser Control Panel, click the button to **fetch / pull logs**.
   The logs are read from the device and **saved on this PC** automatically.

**Good result:** the Control Panel shows the new records / a success message.

**Leave the black window open** while you work. Closing it stops the panel.

---

## Step 3 — Send the stored logs to the server

After the logs are stored, send them up to the server:

1. Back in **PowerShell** (same folder as Step 1), run:

   ```powershell
   C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php
   ```

   > If PHP is somewhere else on this PC, use that path instead — but normally
   > the line above is correct.

**Good result:** it prints how many records were **sent / accepted** and finishes
without a red error.

**If it says `duplicate`:** that's fine — it means those logs were already sent
before. Nothing is lost.

---

## Step 4 — Confirm it arrived (optional but recommended)

Re-run the link check from Step 1:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\fservice-sync\handshake-test.ps1
```

If you still get the three green **[PASS]** lines, the server is healthy and your
send went to a working endpoint. You're done.

---

## Quick recap (for next time)

1. `handshake-test.ps1`  → three green PASS = link OK
2. double-click `run.bat` → fetch + store from device
3. `php.exe ...\sync.php` → send to server
4. (optional) re-run `handshake-test.ps1` → confirm

---

## When to call the admin

Send the on-screen text (a photo is fine) if you see any of these:

- Any **red [FAIL]** in the link check that you can't fix by turning VPN on.
- `run.bat` says **PHP not found** or **BRIDGE NOT RESPONDING**.
- `sync.php` ends with a red error that is **not** “duplicate”.
- The Control Panel won't open in the browser.

Do **not** retry many times in a row if it keeps failing — collect the message
and hand it off. The send is safe to repeat (duplicates are ignored), but a
repeating failure means something upstream needs a fix.
