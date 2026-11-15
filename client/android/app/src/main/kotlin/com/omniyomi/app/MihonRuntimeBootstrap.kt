package com.omniyomi.app

import android.app.Application
import android.content.Context
import eu.kanade.tachiyomi.network.NetworkHelper
import kotlinx.serialization.json.Json
import kotlinx.serialization.protobuf.ProtoBuf
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.addSingleton
import uy.kohesive.injekt.api.addSingletonFactory
import uy.kohesive.injekt.api.fullType

/**
 * Minimal on-device Injekt graph required by Mihon/Tachiyomi extension classes.
 * It is initialized before a class from a downloaded APK is instantiated.
 */
object MihonRuntimeBootstrap {
    @Volatile private var initialized = false

    @Synchronized
    fun initialize(application: Application) {
        if (initialized) return
        Injekt.addSingleton(fullType<Application>(), application)
        Injekt.addSingleton(fullType<Context>(), application)
        Injekt.addSingletonFactory(fullType<NetworkHelper>()) { NetworkHelper() }
        Injekt.addSingletonFactory(fullType<Json>()) {
            Json {
                ignoreUnknownKeys = true
                explicitNulls = false
            }
        }
        Injekt.addSingletonFactory(fullType<ProtoBuf>()) { ProtoBuf }
        initialized = true
    }
}
