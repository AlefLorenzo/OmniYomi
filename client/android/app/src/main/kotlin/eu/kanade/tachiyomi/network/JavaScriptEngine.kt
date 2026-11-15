package eu.kanade.tachiyomi.network

import android.content.Context
import app.cash.quickjs.QuickJs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * On-device JavaScript evaluation service used by Mihon extensions.
 * Execution runs off the UI thread and each evaluation owns its QuickJS context.
 */
class JavaScriptEngine(private val context: Context) {
    @Suppress("UNCHECKED_CAST")
    suspend fun <T> evaluate(script: String): T = withContext(Dispatchers.Default) {
        QuickJs.create().use { engine ->
            engine.evaluate(script) as T
        }
    }
}
