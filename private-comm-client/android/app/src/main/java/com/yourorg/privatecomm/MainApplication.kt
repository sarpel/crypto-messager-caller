package com.yourorg.privatecomm

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {
    private val reactNativeHost = ReactNativeHost(this)

    override fun getReactNativeHost(): ReactNativeHost {
        return reactNativeHost
    }
}
