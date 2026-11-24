import Foundation
import Capacitor
import CoreBluetooth

/**
 * TreadmillBlePlugin — кастомный Capacitor-плагин для iOS (CoreBluetooth → FTMS).
 *
 * Поддерживаемые UUID (Bluetooth SIG):
 *  - Fitness Machine Service:            0x1826
 *  - Treadmill Data:                      0x2ACD
 *  - Rower Data:                          0x2AD1
 *  - Indoor Bike Data:                    0x2AD2
 *  - Cross Trainer Data:                  0x2ACE
 *  - Fitness Machine Control Point:      0x2AD9
 *  - Fitness Machine Feature:            0x2ACC
 *  - Supported Speed Range:               0x2AD4
 *  - Supported Inclination Range:       0x2AD5
 *  - Supported Resistance Range:        0x2AD6
 *  - Heart Rate Service:                  0x180D / Measurement 0x2A37
 */
@objc(TreadmillBlePlugin)
public class TreadmillBlePlugin: CAPPlugin, CBCentralManagerDelegate {

    private static let ftmsUUID: CBUUID = CBUUID(string: "00001826-0000-1000-8000-00805F9B34FB")!
    private static let treadmillDataUUID: CBUUID = CBUUID(string: "00002ACD-0000-1000-8000-00805F9B34FB")!
    private static let rowerDataUUID: CBUUID = CBUUID(string: "00002AD1-0000-1000-8000-00805F9B34FB")!
    private static let indoorBikeDataUUID: CBUUID = CBUUID(string: "00002AD2-0000-1000-8000-00805F9B34FB")!
    private static let crossTrainerDataUUID: CBUUID = CBUUID(string: "00002ACE-0000-1000-8000-00805F9B34FB")!
    private static let controlPointUUID: CBUUID = CBUUID(string: "00002AD9-0000-1000-8000-00805F9B34FB")!
    private static let featureUUID: CBUUID = CBUUID(string: "00002ACC-0000-1000-8000-00805F9B34FB")!
    private static let supportedSpeedRangeUUID: CBUUID = CBUUID(string: "00002AD4-0000-1000-8000-00805F9B34FB")!
    private static let supportedInclinationRangeUUID: CBUUID = CBUUID(string: "00002AD5-0000-1000-8000-00805F9B34FB")!
    private static let supportedResistanceRangeUUID: CBUUID = CBUUID(string: "00002AD6-0000-1000-8000-00805F9B34FB")!
    private static let heartRateServiceUUID: CBUUID = CBUUID(string: "0000180D-0000-1000-8000-00805F9B34FB")!
    private static let heartRateCharUUID: CBUUID = CBUUID(string: "00002A37-0000-1000-8000-00805F9B34FB")!

    private var centralManager: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var peripheralDelegate: TreadmillPeripheralDelegate?

    private var treadmillChar: CBCharacteristic?
    private var controlPointChar: CBCharacteristic?
    private var heartRateChar: CBCharacteristic?

    private var machine: String = "treadmill"

    private var eventSink: CAPEventSink?
    private var connectContinuation: ((String?) -> Void)?
    private var commandContinuation: ((String) -> Void)?

    override public init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    private func publishEvent(name: String, data: [String: Any]) {
        eventSink?.emit(name: name, data: data)
    }

    private func emitMetrics(_ metrics: [String: Any]) {
        publishEvent(name: "metrics", data: ["metrics": metrics])
    }

    private func startCommand(_ op: UInt8, _ param: Int16) {
        var data = [UInt8](repeating: 0, count: 3)
        data[0] = op
        data[1] = UInt8(bitPattern: param & 0xFF)
        data[2] = UInt8(bitPattern: (param >> 8) & 0xFF)
        controlPointChar?.writeValue(withResponse: true)
    }

    private func failPendingConnect() {
        connectContinuation?(nil)
        connectContinuation = nil
    }

    private func resolvePendingConnect(_ name: String?) {
        connectContinuation?(name)
        connectContinuation = nil
    }

    private func finishCommand(_ message: String) {
        commandContinuation?(message)
        commandContinuation = nil
    }

    public func centralManagerDidUpdateState(_ centralManager: CBCentralManager) {
        if centralManager.state == .poweredOn {
            centralManager.scanForPeripherals(withServices: [TreadmillBlePlugin.ftmsUUID], options: nil)
        }
    }

    public func centralManager(_ centralManager: CBCentralManager, didDiscoverPeripheral peripheral: CBPeripheral, error: Error?) {
        centralManager.connect(peripheral, options: nil)
    }

    public func centralManager(_ centralManager: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error) {
        if peripheral.isEqual(self.peripheral) {
            self.peripheral = nil
            failPendingConnect()
        }
    }

    public func centralManager(_ centralManager: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error) {
        if peripheral.isEqual(self.peripheral) {
            self.peripheral = nil
            failPendingConnect()
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        if let p = peripheral, p.state == .connected {
            resolvePendingConnect(p.name)
            call.resolve(["name": p.name ?? "Treadmill"] as [String: Any])
            return
        }
        connectContinuation = { name in
            call.resolve(["name": name ?? "Treadmill"] as [String: Any])
        }
        if peripheralDelegate == nil {
            peripheralDelegate = TreadmillPeripheralDelegate()
        }
        peripheralDelegate?.plugin = self
        peripheral?.delegate = peripheralDelegate
        centralManager.scanForPeripherals(withServices: [TreadmillBlePlugin.ftmsUUID], options: nil)
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        if let p = peripheral {
            centralManager.cancelPeripheralConnection(p)
        }
        peripheral = nil
        call.resolve([:] as [String: Any])
    }

    @objc func setSpeed(_ call: CAPPluginCall, value: Double) {
        startCommand(0x02, Int16(bitPattern: Int16(value * 100)))
        finishCommand("ok")
        call.resolve([:] as [String: Any])
    }

    @objc func setInclination(_ call: CAPPluginCall, value: Double) {
        startCommand(0x03, Int16(bitPattern: Int16(value * 10)))
        finishCommand("ok")
        call.resolve([:] as [String: Any])
    }

    @objc func setResistance(_ call: CAPPluginCall, value: Double) {
        startCommand(0x04, Int16(bitPattern: Int16(value * 10)))
        finishCommand("ok")
        call.resolve([:] as [String: Any])
    }

    @objc func start(_ call: CAPPluginCall) {
        startCommand(0x07, 0)
        finishCommand("ok")
        call.resolve([:] as [String: Any])
    }

    @objc func pause(_ call: CAPPluginCall) {
        startCommand(0x08, 0x02)
        finishCommand("ok")
        call.resolve([:] as [String: Any])
    }

    @objc func stop(_ call: CAPPluginCall) {
        startCommand(0x08, 0x01)
        finishCommand("ok")
        call.resolve([:] as [String: Any])
    }
}

private class TreadmillPeripheralDelegate: NSObject, CBPeripheralDelegate {

    weak var plugin: TreadmillBlePlugin?
    var service: CBService?
    var treadmillChar: CBCharacteristic?
    var controlPointChar: CBCharacteristic?
    var heartRateChar: CBCharacteristic?
    var machine: String = "treadmill"

    override init() {
        super.init()
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = peripheral.services?.first(where: { $0.UUID == TreadmillBlePlugin.ftmsUUID }) else {
            plugin?.failPendingConnect()
            return
        }
        self.service = service
        peripheral.delegate = self
        peripheral.discoverCharacteristics(nil, for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristics error: Error?) {
        guard let chars = peripheral.characteristics else {
            plugin?.failPendingConnect()
            return
        }
        var foundTreadmill = false
        for c in chars where c.UUID == TreadmillBlePlugin.treadmillDataUUID {
            treadmillChar = c
            peripheral.setNotifyValue(c, for: peripheral)
            foundTreadmill = true
        }
        for c in chars where c.UUID == TreadmillBlePlugin.controlPointUUID {
            controlPointChar = c
            peripheral.setNotifyValue(c, for: peripheral)
        }
        for c in chars where c.UUID == TreadmillBlePlugin.heartRateCharUUID {
            heartRateChar = c
            peripheral.setNotifyValue(c, for: peripheral)
        }
        if foundTreadmill {
            machine = "treadmill"
        } else if let rower = chars.first(where: { $0.UUID == TreadmillBlePlugin.rowerDataUUID }) {
            treadmillChar = rower
            peripheral.setNotifyValue(rower, for: peripheral)
            machine = "rower"
        } else if let bike = chars.first(where: { $0.UUID == TreadmillBlePlugin.indoorBikeDataUUID }) {
            treadmillChar = bike
            peripheral.setNotifyValue(bike, for: peripheral)
            machine = "indoorbike"
        } else if let cross = chars.first(where: { $0.UUID == TreadmillBlePlugin.crossTrainerDataUUID }) {
            treadmillChar = cross
            peripheral.setNotifyValue(cross, for: peripheral)
            machine = "cross"
        }
        plugin?.resolvePendingConnect(peripheral.name)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if characteristic == treadmillChar {
            if let data = characteristic.value {
                let metrics = TreadmillBlePlugin.decodeMetrics(data: data, machine: machine)
                plugin?.emitMetrics(metrics)
            }
        }
        if characteristic == controlPointChar, let data = characteristic.value, data.count > 0, data[0] == 0x80 {
            let result = data.count > 2 ? data[2] : 0
            if result == 0x01 {
                plugin?.finishCommand("ok")
            } else {
                plugin?.finishCommand("fail")
            }
        }
        if characteristic == heartRateChar, let data = characteristic.value, data.count > 1 {
            let hr = UInt16(data[1]) | (UInt16(data[2]) << 8)
            plugin?.emitMetrics(["hr": hr, "source": "heartrate"] as [String: Any])
        }
    }

    private static func decodeMetrics(data: Data, machine: String) -> [String: Any] {
        var m: [String: Any] = [:]
        guard data.count >= 2 else { return m }
        let flags = UInt16(data[0]) | (UInt16(data[1]) << 8)
        var o = 2
        if machine == "treadmill" {
            if flags & 0x0001 == 0 {
                let speedRaw = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["speed"] = Double(speedRaw) * 0.01
                o += 2
            }
            if flags & 0x0002 != 0 { o += 2 }
            if flags & 0x0004 != 0 {
                let dist = UInt32(data[o]) | (UInt32(data[o + 1]) << 8) | (UInt32(data[o + 2]) << 16)
                m["distance"] = Double(dist)
                o += 3
            }
            if flags & 0x0008 != 0 {
                let inclRaw = Int16(bitPattern: UInt16(data[o]) | (UInt16(data[o + 1]) << 8))
                m["incline"] = Double(inclRaw) * 0.1
                o += 4
            }
            if flags & 0x0080 != 0 {
                let kcal = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["kcal"] = Double(kcal)
                o += 5
            }
            if flags & 0x0100 != 0 {
                m["hr"] = Double(data[o])
                o += 1
            }
            if flags & 0x0400 != 0 {
                let elapsed = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["elapsed"] = Double(elapsed)
                o += 2
            }
        } else if machine == "rower" {
            if flags & 0x0001 == 0 {
                m["stroke"] = Double(data[o])
                m["strokeCount"] = Double(UInt16(data[o + 1]) | (UInt16(data[o + 2]) << 8))
                o += 3
            }
            if flags & 0x0002 != 0 { o += 1 }
            if flags & 0x0004 != 0 {
                let dist = UInt32(data[o]) | (UInt32(data[o + 1]) << 8) | (UInt32(data[o + 2]) << 16)
                m["distance"] = Double(dist)
                o += 3
            }
            if flags & 0x0020 != 0 { m["power"] = Double(Int16(bitPattern: UInt16(data[o]) | (UInt16(data[o + 1]) << 8))); o += 2 }
            if flags & 0x0080 != 0 {
                m["resistance"] = Double(data[o])
                o += 1
            }
            if flags & 0x0100 != 0 {
                let kcal = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["kcal"] = Double(kcal)
                o += 5
            }
            if flags & 0x0200 != 0 { m["hr"] = Double(data[o]); o += 1 }
            if flags & 0x0400 != 0 {
                let elapsed = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["elapsed"] = Double(elapsed)
                o += 2
            }
        } else if machine == "indoorbike" {
            if flags & 0x0001 == 0 {
                let speedRaw = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["speed"] = Double(speedRaw) * 0.01
                o += 2
            }
            if flags & 0x0002 != 0 { o += 2 }
            if flags & 0x0004 != 0 {
                m["cadence"] = Double(UInt16(data[o]) | (UInt16(data[o + 1]) << 8)) * 0.5
                o += 2
            }
            if flags & 0x0010 != 0 {
                let dist = UInt32(data[o]) | (UInt32(data[o + 1]) << 8) | (UInt32(data[o + 2]) << 16)
                m["distance"] = Double(dist)
                o += 3
            }
            if flags & 0x0020 != 0 { m["resistance"] = Double(Int16(bitPattern: UInt16(data[o]) | (UInt16(data[o + 1]) << 8))); o += 2 }
            if flags & 0x0040 != 0 { m["power"] = Double(Int16(bitPattern: UInt16(data[o]) | (UInt16(data[o + 1]) << 8))); o += 2 }
            if flags & 0x0100 != 0 {
                let kcal = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["kcal"] = Double(kcal)
                o += 5
            }
            if flags & 0x0200 != 0 { m["hr"] = Double(data[o]); o += 1 }
            if flags & 0x0400 != 0 {
                let elapsed = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["elapsed"] = Double(elapsed)
                o += 2
            }
        } else if machine == "cross" {
            if flags & 0x0001 == 0 {
                let speedRaw = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["speed"] = Double(speedRaw) * 0.01
                o += 2
            }
            if flags & 0x0002 != 0 { o += 2 }
            if flags & 0x0004 != 0 {
                let dist = UInt32(data[o]) | (UInt32(data[o + 1]) << 8) | (UInt32(data[o + 2]) << 16)
                m["distance"] = Double(dist)
                o += 3
            }
            if flags & 0x0040 != 0 {
                let inclRaw = Int16(bitPattern: UInt16(data[o]) | (UInt16(data[o + 1]) << 8))
                m["incline"] = Double(inclRaw) * 0.1
                o += 4
            }
            if flags & 0x0400 != 0 {
                let kcal = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["kcal"] = Double(kcal)
                o += 5
            }
            if flags & 0x0800 != 0 { m["hr"] = Double(data[o]); o += 1 }
            if flags & 0x2000 != 0 {
                let elapsed = UInt16(data[o]) | (UInt16(data[o + 1]) << 8)
                m["elapsed"] = Double(elapsed)
                o += 2
            }
        }
        return m;
    }
}
