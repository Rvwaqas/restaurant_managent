# 📱 Client Tablet Installation & Delivery Guide (Nyaman Bah POS)

Yeh document **Client ke Android Tablet / POS Machine** par software setup karne aur client ko deliver karne ka mukammal aasan tareeqa hai.

---

## 🎯 Final Goal (Client ka Experience)
Client ko **koi command ya terminal chalane ki zaroorat nahi hogi**:
1. Client subah POS Machine / Tablet ka **Power On** karega.
2. Background mein **Termux Boot** khud software start kar dega.
3. Client ke Home Screen par **Nyaman Bah** ka App icon hoga, uspe tap karega aur full-screen POS chalu ho jayegi!

---

## 📦 Step 1: Release Package Banana (Apne Laptop Par)

Sab se pehle apne laptop par standalone offline release package banayein:

Root folder mein terminal me run karein:
```bash
python scripts/build_release.py
```
Is se `dist/` folder ke andar ek zip/tar file ban jayegi (maslan `pos-release-v1.0.0.tar.gz`) jisme:
- Python FastAPI backend
- Pre-built Next.js production frontend
- Auto-installer scripts aur seed data shamil honge.

Is file ko **USB Flash Drive** ya **Google Drive / WhatsApp Web** ke zariye client ke tablet par transfer kar dein.

---

## 📲 Step 2: Client ke Tablet par 1-Time Setup (Sirf Pehli Baar)

Yeh setup aap ne client ko deliver karne se pehle tablet par **sirf 1 dafa** karna hai:

### 1. Do Apps Install Karein (Play Store ki zaroorat nahi):
Client ke tablet mein browser se **F-Droid** ya direct APK download karein:
- **Termux APK** (Android Terminal Environment)
- **Termux:Boot APK** (Tablet on hotay hi software khud start karne ke liye)

### 2. File Copy Karein:
Apna `pos-release-v1.0.0.tar.gz` tablet ke `Download` folder mein copy karein.

### 3. Termux Open Karein aur Sirf Yeh Commands Run Karein:
Termux open karein aur yeh likhein:

```bash
# Storage permission allow karein
termux-setup-storage

# Installer run karein
pkg update -y && pkg install -y python git
tar -xzf ~/storage/downloads/pos-release-*.tar.gz -C ~/
cd ~/pos
sh scripts/install_termux.sh
```

### 4. Auto-Start On Boot Setup Karein:
Taake tablet restart ya power on hone par POS khud chalu ho jaye:
```bash
mkdir -p ~/.termux/boot
cp ~/pos/scripts/10-pos-start.sh ~/.termux/boot/
termux-wake-lock
```

---

## 🖥️ Step 3: Tablet ke Home Screen par App Icon Banana (PWA)

1. Tablet mein **Google Chrome** open karein.
2. Address bar mein likhein:
   ```
   http://localhost:3000
   ```
3. Login Screen samne aayegi (**Nyaman Bah - A Taste of Tawau** ka logo hoga).
4. Chrome ke top right corner mein **3 dots `⋮`** par tap karein.
5. Menu mein **"Install app"** ya **"Add to Home screen"** par tap karein.
6. Popup aayega, **Install** dabayein.

**Nateeja:** Tablet ke home screen par **Nyaman Bah** ka icon ban jayega.

---

## 🚀 Step 4: Client ko Deliver Karne ke Rules (Client Instructions)

Client ko bas yeh 3 baatein samjhaani hain:

| S.No | Kaam | Tareeqa |
|---|---|---|
| **1** | **Rozana POS Chalana** | Tablet On karein, aur Home screen par **Nyaman Bah** app icon par tap karein. |
| **2** | **Waiter Login** | Waiter apna PIN / Password (`1234`) daal kar order lega. |
| **3** | **Admin Login** | Owner / Manager `admin` aur `admin123` se reports aur sales dekhega. |
| **4** | **Din ke Aakhir me** | Rozana raat ko **Admin > Reports > Daily Closing** se Z-Report print karein aur tablet ko normal tareeqay se band (Shut Down) kar dein. |

---

## 🛟 Troubleshooting / Emergency Commands (Agar zaroorat pare)

Agar kabhi server stop ho jaye:
- Termux open karein aur likhein:
  ```bash
  pos restart
  ```
- Server status dekhne ke liye:
  ```bash
  pos status
  ```

