# Сборка нативного iOS-приложения (Capacitor + CoreBluetooth) — Fitness Trainer

Цель: чтобы **всё работало на iPhone** — включая Bluetooth-треначок (беговая дорожка / гребной тренажёр / велотренажёр) через FTMS.

Web Bluetooth в iOS (Safari / WebKit) не реализован, поэтому для iPhone нужна нативная обёртка.

## Что уже в репозитории

- `ios/App/App/Plugins/TreadmillBle/TreadmillBlePlugin.swift` — плагин CoreBluetooth → FTMS;
- `ios/App/App/AppDelegate.swift` — регистрация плагина;
- `ios/App/App/Info.plist` — разрешения Bluetooth (`NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`);
- `ios/App/capacitor.config.json` — конфиг Capacitor;
- `ios/BUILD_TEMPLATE/` — шаблон для копирования в Xcode-проект Capacitor;
- `treadmill.js` — нативный путь (`tmSupportedNative`), вызовы и события `metrics`.

## Предварительные требования

- Mac с **Xcode 15+** (Apple Silicon или Intel), iOS SDK;
- Apple Developer аккаунт (для сборки и установки на реальное устройство);
- iPhone 13 (BLE работает на iPhone 13).

## Пошаговая сборка

```bash
# 1. Node.js + npm
node -v && npm -v

# 2. Capacitor CLI и плагины
npm i @capacitor/cli @capacitor/core @capacitor/ios

# 3. Создать iOS-проект (один раз)
npx cap add ios

# 4. Скопировать веб-ассеты в ios/App/App (или поправить webDir в capacitor.config.json)
cp index.html styles.css program.js app.js treadmill.js views-today.js views-more.js views-guide.js app-events.js sw.js manifest.webmanifest icon.svg icon-180.png icon-192.png icon-512.png ios/App/App/

# 5. iOS-приложение должно содержать:
#    - ios/App/App/Plugins/TreadmillBle/TreadmillBlePlugin.swift
#    - ios/App/App/AppDelegate.swift
#    - ios/App/App/Info.plist (Bluetooth permissions)
#    - ios/App/capacitor.config.json

# 6. Открыть проект в Xcode
npx cap open ios

# 7. В Xcode:
#    - Runner таргет → Signing & Capabilities:
#        • Team: <Apple Developer Team>;
#        • Bundle Identifier: com.fzonov.fitnesstrainer;
#        • Signing Style: Automatic;
#        • Capabilities: iOS Capability → Bluetooth (LE) если доступно.
#    - Runner таргет → Build Phases → Compile Sources:
#        • добавить TreadmillBlePlugin.swift;
#        • добавить файлы Capacitor (обычно уже добавлены шаблоном через SPM).
#    - iOS 13+ target: iOS Deployment Target ≥ 13.

# 8. Build → Run на iPhone 13 (подключить устройство, Xcode сам ставит на девайс).

# 9. Синхронизация веб-ассетов после правок
npx cap sync ios
```

## Проверка на устройстве

1. iPhone 13: приложение запускается, Bluetooth включён в iOS.
2. Приложение запрашивает разрешение Bluetooth (NSBluetoothAlwaysUsageDescription / NSBluetoothPeripheralUsageDescription).
3. «Сегодня → Треначок · Bluetooth» → «Подключить треначёр» → в нативном приложении появится системный/кастомный поток поиска.
4. Выставить целевую скорость и наклон / сопротивление → «Задать».
5. «▶ Старт» / «⏸ Пауза» / «⏹ Стоп» → результат сохраняется в историю треначка.
6. На девайсе: переключить iOS в режим «Треначок», подключить треначок (BLE).

## Возможные проблемы

- Если Xcode ругается на `@objc` / Swift — убедиться, что класс наследует `NSObject` (через `CAPPlugin`) и имя совпадает с `@objc(TreadmillBlePlugin)`.
- `npx cap add ios` каждый раз создаёт свежий проект — перед копированием файлов проверять пути (`ios/App/App/...`).
- После `npx cap open ios` Xcode может предлагать добавить SPM-пакет `@capacitor/...`; для чистого кастомного плагина достаточно добавить Swift-файл в Compile Sources.

## Обновление приложения

- Правки в веб-ассетах → `npx cap sync ios` → пересборка.
- Правки в Swift-плагине → пересборка в Xcode без `sync`.
