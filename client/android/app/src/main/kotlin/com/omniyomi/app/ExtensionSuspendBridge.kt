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

/**
 * Calls the Kotlin suspend API exposed by extension-lib 1.6 from Java callers.
 * The source operation runs inside a proper coroutine context.
 */
object ExtensionSuspendBridge {
    @JvmStatic
    fun popular(source: CatalogueSource, page: Int): MangasPage =
        runBlocking(Dispatchers.IO) { source.getPopularManga(page) }

    @JvmStatic
    fun latest(source: CatalogueSource, page: Int): MangasPage =
        runBlocking(Dispatchers.IO) { source.getLatestUpdates(page) }

    @JvmStatic
    fun search(source: CatalogueSource, page: Int, query: String, filters: FilterList): MangasPage =
        runBlocking(Dispatchers.IO) { source.getSearchManga(page, query, filters) }

    @JvmStatic
    fun mangaUpdate(
        source: Source,
        manga: SManga,
        chapters: List<SChapter>,
        fetchDetails: Boolean,
        fetchChapters: Boolean,
    ): SMangaUpdate = runBlocking(Dispatchers.IO) {
        source.getMangaUpdate(manga, chapters, fetchDetails, fetchChapters)
    }

    @JvmStatic
    fun pages(source: Source, chapter: SChapter): List<Page> =
        runBlocking(Dispatchers.IO) { source.getPageList(chapter) }
}
