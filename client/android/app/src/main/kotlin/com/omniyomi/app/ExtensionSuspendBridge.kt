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
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

/**
 * Calls the real Kotlin suspend API exposed by extension-lib 1.6.
 *
 * Java callers enter this bridge from the extension worker executor; runBlocking
 * keeps that boundary synchronous while the source implementation suspends
 * normally inside a coroutine context.
 */
object ExtensionSuspendBridge {
    @JvmStatic
    fun popular(source: CatalogueSource, page: Int): MangasPage =
        runBlocking(Dispatchers.IO) {
            source.getPopularManga(page)
        }

    @JvmStatic
    fun latest(source: CatalogueSource, page: Int): MangasPage =
        runBlocking(Dispatchers.IO) {
            source.getLatestUpdates(page)
        }

    @JvmStatic
    fun search(source: CatalogueSource, page: Int, query: String, filters: FilterList): MangasPage =
        runBlocking(Dispatchers.IO) {
            source.getSearchManga(page, query, filters)
        }

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
        runBlocking(Dispatchers.IO) {
            var lastError: Exception? = null
            repeat(2) { attempt ->
                try {
                    return@runBlocking source.getPageList(chapter)
                } catch (error: Exception) {
                    lastError = error
                    val messages = generateSequence(error as Throwable?) { it.cause }
                        .mapNotNull { it.message }
                        .joinToString(" ")
                        .lowercase()
                    val isTransientDecryptTimeout =
                        messages.contains("timed out") ||
                        messages.contains("timeout") ||
                        messages.contains("decrypting image links")

                    // Algumas extensões usam links temporários e falham durante a
                    // descriptografia por oscilação de rede. Repetir uma única vez
                    // evita deixar o capítulo inutilizável sem criar loop infinito.
                    if (attempt == 0 && isTransientDecryptTimeout) {
                        delay(1000)
                    } else {
                        throw error
                    }
                }
            }
            throw lastError ?: IllegalStateException("A extensão não retornou páginas.")
        }
}
