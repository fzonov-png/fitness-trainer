import UIKit
import Capacitor
import CoreBluetooth

@UIApplicationMain
public class AppDelegate: CAPApplicationDelegate {

    public override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    public override func init(config: CAPBridgeConfiguration) -> (NSObject, (Promise<Bool>?, @escaping (Result<Bool, Error>) -> Void) -> Void) {
        let registry = CAPPluginRegistry(plugins: [])
        let plugin = registry.getPluginInstance(TreadmillBlePlugin.self) as! TreadmillBlePlugin
        return (plugin, { promise in
            promise?.resolve(with: true)
        })
    }
}
