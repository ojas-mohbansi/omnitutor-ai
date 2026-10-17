// Internal excerpt ids ("C2") never reach students. Cases are the phrasings found in real stored
// model output (Question.explanation in the demo DB, 2026-10-14). Run: npm run test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripExcerptRefs as strip } from "../src/text";

describe("stripExcerptRefs", () => {
  it("drops sentence-initial attributions and re-capitalises", () => {
    assert.equal(strip("Not answered. According to C2, process scheduling is the basis of multiprogramming."), "Not answered. Process scheduling is the basis of multiprogramming.");
    assert.equal(strip("As stated in C21 and C25, the ready queue is the waiting list."), "The ready queue is the waiting list.");
    assert.equal(strip("According to source C18, CPU scheduling is the OS mechanism."), "CPU scheduling is the OS mechanism.");
    assert.equal(strip("According to the process state diagram in C9, the ready state is reached."), "The ready state is reached.");
    assert.equal(strip("Based on the alternating sequence described in C3 and C4, the process executes."), "The process executes.");
    assert.equal(strip("Using the formula from C12: Waiting time = Turnaround time - Burst time."), "Waiting time = Turnaround time - Burst time.");
  });
  it("replaces ids used as the subject", () => {
    assert.equal(strip("C10 defines dispatch latency as the time to stop one process."), "The source defines dispatch latency as the time to stop one process.");
    assert.equal(strip("Excerpt C13 shows the calculation."), "The source shows the calculation.");
    assert.equal(strip("Source C13 and C14 demonstrate that after the time slice…"), "The sources demonstrate that after the time slice…");
    assert.equal(strip("C3 and C5 define I/O bound processes as short bursts."), "The sources define I/O bound processes as short bursts.");
    assert.equal(strip("The slice dictates switch counts, and C21 notes that the algorithm matters."), "The slice dictates switch counts, and the source notes that the algorithm matters.");
    assert.equal(strip("It picks a process, while C7 warns against mixing them."), "It picks a process, while the source warns against mixing them.");
  });
  it("replaces ids after a preposition and drops parenthesised ones", () => {
    assert.equal(strip("Context switches (as seen in RR scheduling in C13/C14) add overhead."), "Context switches (as seen in RR scheduling in the sources) add overhead.");
    assert.equal(strip("It gets another turn, as shown by the queue transitions in C14."), "It gets another turn, as shown by the queue transitions in the source.");
    assert.equal(strip("Waiting time is 17 ms (C2)."), "Waiting time is 17 ms.");
    assert.equal(strip("See the table [C1, C5] for values."), "See the table for values.");
    assert.equal(strip("This follows from excerpt C3."), "This follows from the source.");
  });
  it("leaves ordinary text alone", () => {
    for (const s of ["Vitamin C2 is not a thing; C++ and C# are languages.", "Process P2 runs at t = 3.", "No refs here.", "Class C networks use 24-bit masks."]) {
      assert.equal(strip(s), s);
    }
  });
});
