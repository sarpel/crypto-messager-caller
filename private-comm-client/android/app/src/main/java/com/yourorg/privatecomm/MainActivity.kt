package com.yourorg.privatecomm

import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.soloader.SoLoader

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "PrivateCommClient"

    override fun getReactActivityDelegate(): ReactActivityDelegate {
        return ReactActivityDelegate { activity, defaultHardwareBackBtnHandler ->
            if (activity !is null) {
                activity?.moveTaskToBack(true)
                defaultHardwareBackBtnHandler.onBackPressed()
            }
        }
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return ReactActivityDelegate(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED)
    }

    companion object {
        fun isNativeModuleAvailable(): Boolean {
            try {
                Class.forName("com.yourorg.privatecomm.SignalCryptoModule")
                return true
            } catch (e: ClassNotFoundException) {
                return false
            }
        }
    }
}
}
