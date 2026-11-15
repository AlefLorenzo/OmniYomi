package eu.kanade.tachiyomi.source;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.preference.PreferenceScreen;
import com.omniyomi.app.ExtensionRuntimeContext;

/** Settings contract exposed to Mihon extensions. */
public interface ConfigurableSource extends Source {
    default SharedPreferences getSourcePreferences() {
        return ExtensionRuntimeContext.getContext().getSharedPreferences(
            "source_" + getId(),
            Context.MODE_PRIVATE
        );
    }

    void setupPreferenceScreen(PreferenceScreen screen);
}
