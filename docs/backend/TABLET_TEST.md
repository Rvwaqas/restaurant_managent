# Restaurant POS - Tablet Hardware & Environment Testing Guide

This simple, step-by-step guide is for technicians or non-developers testing whether an Android tablet is ready to run the Restaurant POS server 24/7.

No coding, rooting, or special software is required—just the tablet, a Wi-Fi connection, and a USB cable or local file transfer.

---

## Step 1: Install Termux Apps from F-Droid

> [!CAUTION]
> **DO NOT install Termux from Google Play Store**. The Play Store version is obsolete and broken. Only use F-Droid.

1. Open Chrome on the tablet and visit: **[f-droid.org](https://f-droid.org/)**
2. Download and install the **F-Droid APK**.
3. Open F-Droid, search for and install these three packages:
   - **Termux** (Terminal emulator)
   - **Termux:Boot** (Enables server auto-start when tablet turns on)
   - **Termux:API** (Allows background battery and power management)

---

## Step 2: Initialize Termux Environment

1. Open the **Termux** app on the tablet.
2. Type or paste the following command, then tap Enter:
   ```bash
   pkg update -y
   ```
3. Install Python and OpenSSL:
   ```bash
   pkg install -y python openssl
   ```
4. Grant storage permissions so Termux can access your tablet files:
   ```bash
   termux-setup-storage
   ```
   *(A popup will appear asking for storage permission. Tap **Allow**).*

---

## Step 3: Copy and Extract the Release Tarball

1. Transfer the POS release file (e.g. `pos-release-v1.0.0-20261108.tar.gz`) from your PC to the tablet's **Download** folder (via USB cable, Google Drive, or local transfer).
2. Inside Termux, create a `pos` folder and copy the file:
   ```bash
   mkdir -p ~/pos
   cd ~/pos
   cp ~/storage/downloads/pos-release-*.tar.gz .
   ```
3. Extract the release bundle:
   ```bash
   tar -xzf pos-release-*.tar.gz
   ```

---

## Step 4: Run the Diagnostic Tests

The diagnostics are completely self-contained and require no internet access or dependencies.

### 4.1 Check Android & Termux Environment
Run the Termux readiness script:
```bash
sh scripts/termux_check.sh
```
- **What it tests**: CPU architecture, Android version, Termux install source, free storage space, wake-lock availability, and auto-start hooks.
- **Expected result**: Prints summary showing `RESULT: PASS` (or `RESULT: WARN`).
- **Output file**: Generates `pos_termux_check_report.txt`.

### 4.2 Run SQLite Concurrency & Storage Benchmark
Run the quick 10-second SQLite performance test:
```bash
python scripts/sqlite_check.py --quick
```
- **What it tests**: Flash memory write speed, multi-threaded ACID transactions (BEGIN IMMEDIATE), and crash recovery with WAL mode.
- **Expected result**: Prints summary showing `RESULT: PASS` with >500 commits/sec.
- **Output file**: Generates `pos_sqlite_check_report.txt`.

---

## Step 5: Copy the Reports Back to Your PC

To retrieve the test reports from Termux to your tablet's standard Download folder:
```bash
cp pos_termux_check_report.txt ~/storage/downloads/
cp pos_sqlite_check_report.txt ~/storage/downloads/
```

Now you can:
1. Connect the tablet to your PC via USB and copy the two text files from the tablet's `Download/` folder.
2. Send the reports to the development team to confirm if the tablet runs **Plan A (Native Termux)** or **Plan B (PRoot Ubuntu)**.

