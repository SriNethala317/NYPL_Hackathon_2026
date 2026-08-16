# Expo SDK 54

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

This project was deliberately moved from SDK 57 down to **SDK 54**, because Expo Go on the App
Store is pinned at client 54.0.2 (released 2025-09-23) and cannot open an SDK 57 project. There is
no newer Expo Go on the App Store, and the SDK 57 iOS client ships only as a simulator build.

**Do not upgrade the SDK** without checking that constraint first — it would break the only way
this project currently runs on a physical iPhone.
