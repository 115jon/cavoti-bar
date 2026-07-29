package com.cavoti.bar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionResultGateTest {
    @Test
    fun ignoresWrongIdAndDuplicateCoreResultsWithoutAbortingActiveCollection() {
        val gate = SessionResultGate()
        gate.begin("active")

        assertEquals(
            SessionResultGate.Decision.Ignored,
            gate.accept("stale", "core", false, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Invalid,
            gate.accept("active", "unknown", false, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Invalid,
            gate.accept("active", "core", true, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Accepted,
            gate.accept("active", "core", false, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Ignored,
            gate.accept("active", "core", false, "authenticated"),
        )
        assertTrue(gate.hasActiveCollection())
    }

    @Test
    fun acceptsOnlyTerminalEnrichmentAfterCoreAndIgnoresLateResults() {
        val gate = SessionResultGate()
        gate.begin("active")

        assertEquals(
            SessionResultGate.Decision.Accepted,
            gate.accept("active", "core", false, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Invalid,
            gate.accept("active", "enrichment", false, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Accepted,
            gate.accept("active", "enrichment", true, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Ignored,
            gate.accept("active", "enrichment", true, "authenticated"),
        )
        assertEquals("active", gate.latestGenerationId())
        assertTrue(gate.isCurrentGeneration("active"))
    }

    @Test
    fun clearsACollectionAfterTerminalCoreFailure() {
        val gate = SessionResultGate()
        gate.begin("active")

        assertEquals(
            SessionResultGate.Decision.Accepted,
            gate.accept("active", "core", true, "auth-required"),
        )
        assertEquals(
            SessionResultGate.Decision.Ignored,
            gate.accept("active", "enrichment", true, "authenticated"),
        )
    }

    @Test
    fun abortClearsTheActiveCollection() {
        val gate = SessionResultGate()
        gate.begin("active")

        gate.abort()

        assertFalse(gate.hasActiveCollection())
        assertEquals(
            SessionResultGate.Decision.Ignored,
            gate.accept("active", "core", false, "authenticated"),
        )
    }

    @Test
    fun preservesTerminalGenerationUntilAnewProbeBegins() {
        val gate = SessionResultGate()
        gate.begin("active")

        assertEquals(
            SessionResultGate.Decision.Accepted,
            gate.accept("active", "core", false, "authenticated"),
        )
        assertEquals(
            SessionResultGate.Decision.Accepted,
            gate.accept("active", "enrichment", true, "authenticated"),
        )
        assertFalse(gate.hasActiveCollection())
        assertEquals("active", gate.latestGenerationId())
        assertTrue(gate.isCurrentGeneration("active"))

        gate.begin("next")

        assertFalse(gate.isCurrentGeneration("active"))
        assertTrue(gate.isCurrentGeneration("next"))
    }

    @Test
    fun rejectsStaleNativeCommandsAfterASecondProbeBegins() {
        val gate = SessionResultGate()
        gate.begin("first")
        gate.begin("second")

        assertFalse(gate.isCurrentGeneration("first"))
        assertTrue(gate.isCurrentGeneration("second"))
        assertFalse(gate.isCurrentGeneration(""))
    }
}
