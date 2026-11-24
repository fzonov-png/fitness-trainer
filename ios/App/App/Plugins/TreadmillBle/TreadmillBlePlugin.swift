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

    /** Текущий тип машины: treadmill | rower | indoorbike | cross */
    private var machine: String = "treadmill"

    private var controlPointChar: CBCharacteristic?
    private var treadmillChar: CBCharacteristic?
    private var heartRateChar: CBCharacteristic?

    private var eventSink: CAPEventSink?
    private var connectContinuation: ((String?) -> Void)?

    override public init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    // MARK: - EventEmitter

    private func publishEvent(name: String, data: [String: Any]) {
        eventSink?.emit(name: name, data: data)
    }

    private func emitMetrics(_ m: [String: Any]) {
        publishEvent(name: "metrics", data: ["metrics": m])
    }

    // MARK:: - CBCentralManagerDelegate

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
            connectContinuation?(nil)
            connectContinuation = nil
        }
    }

    public func centralManager(_ centralManager: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error) {
        if peripheral.isEqual(self.peripheral) {
            self.peripheral = nil
            connectContinuation?(nil)
            connectContinuation = nil
        }
    }

    // MARK:: - CAPPlugin actions

    @objc func connect(_ call: CAPPluginCall) {
        if let p = peripheral, p.state == .connected {
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
        sendControl(op: 0x02, param: Int16(bitPattern: Int16(value * 100))) // UINT16 LE, 0.01 км/ч
        call.resolve([:] as [String: Any])
    }

    @objc func setInclination(_ call: CAPPluginCall, value: Double) {
        sendControl(op: 0x03, param: Int16(bitPattern: Int16(value * 10))) // SINT16 LE, 0.1 %
        call.resolve([:] as [String: Any])
    }

    @objc func setResistance(_ call: CAPPluginCall, value: Double) {
        sendControl(op: 0x04, param: Int16(bitPattern: Int16(value * 10))) // UINT16 LE, уровень * 10
        call.resolve([:] as [String: Any])
    }

    @objc func start(_ call: CAPPluginCall) {
        sendControl(op: 0x07, param: 0) // Start/Resume
        call.resolve([:] as [String: Any])
    }

    @objc func pause(_ call: CAPPluginCall) {
        sendControl(op: 0x08, param: 0x02) // Stop/Pause = 0x02
        call.resolve([:] as [String: Any])
    }

    @objc func stop(_ call: CAPPluginCall) {
        sendControl(op: 0x08, param: 0x01) // Stop/Pause = 0x01
        call.resolve([:] as [String: Any])
    }

    private func sendControl(op: UInt8, param: Int16) {
        guard let char = controlPointChar else { return }
        var data = [UInt8](repeating: 0, count: 3)
        data[0] = op
        data[1] = UInt8(bitPattern: param & 0xFF)
        data[2] = UInt8(bitPattern: (param >> 8) & 0xFF)
        char.writeValue(withResponse: true)
    }
}

/**
 * Delegate конкретного подключённого peripheral: подписка на FTMS-статус,
 * контроль над подключением (promise) и сбор метрик.
 */
private class TreadmillPeripheralDelegate: NSObject, CBPeripheralDelegate {

    weak var plugin: TreadmillBlePlugin?
    var service: CBService?
    var treadmillChar: CBCharacteristic?
    var controlPointChar: CBCharacteristic?
    var heartRateChar: CBCharacteristic?
    var machine: String = "treadmill"
    var onConnected: (() -> Void)?

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
        var foundControl = false
        for c in chars where c.UUID == TreadmillBlePlugin.treadmillDataUUID {
            treadmillChar = c
            peripheral.setNotifyValue(c, for: peripheral)
            foundTreadmill = true
        }
        for c in chars where c.UUID == TreadmillBlePlugin.controlPointUUID {
            controlPointChar = c
            peripheral.setNotifyValue(c, for: peripheral)
            foundControl = true
        }
        for c in chars where c.UUID == TreadmillBlePlugin.heartRateCharUUID {
            heartRateChar = c
            peripheral.setNotifyValue(c, for: peripheral)
        }
        if foundTreadmill {
            self.machine = "treadmill"
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
        plugin?.resolvePendingConnect()
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if characteristic == treadmillChar {
            // TODO: декодировать значение по флагам и emitMetrics
        }
        if characteristic == heartRateChar {
            // TODO: обновить пульс
        }
    }
}

extension TreadmillBlePlugin {
    func failPendingConnect() {
        connectContinuation?(nil)
        connectContinuation = nil
    }
    func resolvePendingConnect() {
        connectContinuation?(nil)
        connectContinuation = nil
    }
}
