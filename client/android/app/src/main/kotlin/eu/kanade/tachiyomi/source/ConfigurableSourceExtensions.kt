package eu.kanade.tachiyomi.source

import android.content.Context
import android.content.SharedPreferences
import com.omniyomi.app.ExtensionRuntimeContext

fun ConfigurableSource.preferenceKey(): String = "source_$id"

fun ConfigurableSource.sourcePreferences(): SharedPreferences = getSourcePreferences()

fun sourcePreferences(key: String): SharedPreferences =
    ExtensionRuntimeContext.getContext().getSharedPreferences(key, Context.MODE_PRIVATE)
