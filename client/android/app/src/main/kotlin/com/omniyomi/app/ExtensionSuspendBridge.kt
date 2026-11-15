package com.omniyomi.app

import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.model.SMangaUpdate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlin.coroutines.Continuation
import kotlin.coroutines.intrinsics.suspendCoroutineUninterceptedOrReturn

/**
 * Executes the JVM ABI generated for Kotlin suspend methods on extension-lib 1.6.
 *
 * The extension manager calls these from its worker executor. A suspend implementation
 * may either return immediately or resume the continuation asynchronously.
 */
object ExtensionSuspendBridge {
    private suspend fun <T> invokeAbi(block: (Continuation<T>) -> Any?): T =
        suspendCoroutineUninterceptedOrReturn { continuation -> block(continuation) }

    @JvmStatic
    fun popular(source: CatalogueSource, page: Int): MangasPage =
        runBlocking(Dispatchers.IO) {
            invokeAbi { continuation -> source.getPopularManga(page, continuation) }
        }

    @JvmStatic
    fun latest(source: CatalogueSource, page: Int): MangasPage =
        runBlocking(Dispatchers.IO) {
            invokeAbi { continuation -> source.getLatestUpdates(page, continuation) }
        }

    @JvmStatic
    fun search(source: CatalogueSource, page: Int, query: String, filters: FilterList): MangasPage =
        runBlocking(Dispatchers.IO) {
            invokeAbi { continuation -> source.getSearchManga(page, query, filters, continuation) }
        }

    @JvmStatic
    fun mangaUpdate(
        source: Source,
        manga: SManga,
        chapters: List<SChapter>,
        fetchDetails: Boolean,
        fetchChapters: Boolean,
    ): SMangaUpdate = runBlocking(Dispatchers.IO) {
        invokeAbi { continuation ->
            source.getMangaUpdate(manga, chapters, fetchDetails, fetchChapters, continuation)
        }
    }

    @JvmStatic
    fun pages(source: Source, chapter: SChapter): List<Page> =
        runBlocking(Dispatchers.IO) {
            invokeAbi { continuation -> source.getPageList(chapter, continuation) }
        }
}
