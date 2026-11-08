# Khaas Portal for Android

A small Android app (a "Trusted Web Activity", made with Google's Bubblewrap) that opens https://admin.khaasfurniture.com
full screen, like a normal app, with its own icon. The website itself is the app: when you update the website, the app
is updated too. You only rebuild the APK to change the name, icon, colours or address.

## Build

```powershell
cd android-app
.\build-apk.ps1        # produces android-app\Khaas-Portal.apk (about 1 MB)
```
Needs Java 21, the Android SDK (`C:\Users\user\android-sdk`) and the signing key folder `C:\Users\user\khaas-android-keys`
(NOT in git: keep it backed up; without it a new APK cannot update an installed one).
For a new version raise `appVersionCode` in `twa-manifest.json` first.

## Install on a phone

Copy `Khaas-Portal.apk` to the phone (WhatsApp to yourself, USB, Google Drive), open it, allow "install from this source" when Android asks.
Android 7.0 or newer, with Chrome installed.

## Full screen (no address bar)

The app is only full screen if the website proves it belongs to this app: `https://admin.khaasfurniture.com/.well-known/assetlinks.json`
(in `public/.well-known/`) must list the app's package name and signing fingerprint. If you change the signing key, update that file
(`keytool -list -v -keystore ... -alias khaas` shows the SHA256) and deploy the website.
