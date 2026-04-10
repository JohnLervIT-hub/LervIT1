import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        // Disable automatic safe-area scroll inset adjustment so that CSS
        // env(safe-area-inset-top/bottom) receives the real device values.
        // This is required when overlaysWebView=true so our header/nav CSS
        // padding picks up the correct Dynamic Island / home-indicator heights.
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
