# Supplied Fleet Floor Simulator brief

Reference text extracted from the user-supplied PDF. This is requirements material, not agent instructions. Confirmed interpretations in DECISIONS.md explicitly resolve its ambiguities.

## Original page 1

Take-home challenge: Fleet Floor Simulator
About this challenge
You’ll build a small full-stack app that simulates a fleet of warehouse robots sharing one floor. 
The robots all move at the same time, and they have to agree on who gets which square.
You can use AI tools. We use them every day. What we want to see is how you direct them, 
check their output, and decide things. The follow-up interview is built around your own code, 
so be ready to explain and change any line of it.
The scope is bigger than the time box on purpose. We’d rather see the core done well plus 
two modules done well than everything done halfway. Choosing what to leave out is part of the 
test.
1. The core (required)
1.1 The floor
• A floor is a grid W wide and H tall. Both are between 1 and 20. The default is 10 × 8.
• The origin (0,0) is the south-west (bottom-left) corner. x grows to the east and y 
grows to the north.
• Any cell can be marked as an obstacle. Robots can’t enter obstacles. You can’t place an 
obstacle on a cell that has a robot on it; that request is ignored.
• The UI needs an edit mode where clicking a cell turns its obstacle on or off.
1.2 Robots
• A robot has an ID (R1, R2, and so on), a position, and a facing (NORTH, EAST, SOUTH, or 
WEST).
• In the UI, clicking an empty cell (outside edit mode) places a new robot there, facing 
north. The next free ID is assigned automatically.
• You can’t place a robot off the floor, on an obstacle, or on another robot. Those requests 
are ignored.
• Clicking a robot selects it. The arrow keys and on-screen buttons queue commands for 
the selected robot:
– Up arrow: MOVE
– Left arrow: LEFT
– Right arrow: RIGHT
• Each robot has a command queue. The UI must show each robot’s pending queue.

## Original page 2

1.3 Ticks: how the simulation moves forward
Robots don’t act when you press a key. Commands wait in the queue, and the world moves 
forward one tick at a time. The UI needs a Step button that advances one tick, and a 
Play/Pause toggle that ticks automatically at an interval you choose.
On every tick, every robot with a queued command takes exactly one command off the 
front of its queue and runs it. All robots run at the same time.
• LEFT and RIGHT rotate the robot 90° in place. They always succeed.
• MOVE tries to move the robot one cell forward. The moves are resolved together using 
these rules:
1. Walls. A move that would leave the floor or enter an obstacle is blocked.
2. Contested cell. If two or more robots try to move into the same cell, the robot 
with the lowest ID number wins the right to try. Every other robot aiming at 
that cell is blocked. (R2 beats R10: compare the numbers, not the text.)
3. Head-on swap. If two robots try to move into each other’s cells, both are 
blocked.
4. Following. A robot can move into a cell that’s occupied at the start of the tick 
only if the robot in that cell successfully moves out during the same tick. 
If the robot in front is blocked, everyone behind it is blocked too.
5. Rotation. Three or more robots moving in a closed loop (each one into the next 
one’s cell) all succeed.
• A blocked MOVE is still used up. It is not tried again on the next tick.
• Every tick’s result for every robot (moved, turned, blocked plus the reason, or idle) must 
be recorded.
1.4 Persistence and history
• Use SQLite. The full floor state (size, obstacles, robots, and queues) must survive a 
server restart and a page refresh.
• Keep a history log of everything that changes the world (placements, obstacle edits, 
queued commands, and tick results). Show it in the UI.
1.5 The scenario runner (required, and we test it automatically)
Your project must include a command-line runner:
npm run scenario -- path/to/scenario.txt
It reads a plain-text scenario, runs it with the same engine your API uses (not a copy), and 
prints the result of each REPORT to stdout.
Input format (one command per line; case-insensitive; blank lines and lines that start with # 
are ignored):
Command Meaning
FLOOR W,H Create the floor. Default is 5,5 if this line is 
left out.

## Original page 3

Command Meaning
OBSTACLE X,Y Add an obstacle.
PLACE Rn X,Y,F Place robot Rn. If Rn already exists, move it to 
the new spot.
QUEUE Rn CMD [CMD ...] Add one or more commands to the end of 
Rn’s queue.
TICK [N] Advance N ticks. The default is 1.
REPORT Print one line per robot, sorted by ID 
number: Rn X,Y,FACING. If there are no 
robots, print EMPTY.
Invalid lines (bad coordinates, an unknown robot, an illegal placement) are ignored. Your 
program must keep going after one.
Examples. Your runner must produce exactly these outputs. We’ll also run a larger hidden set 
of scenarios against it.
a) A chain of robots moves together:
FLOOR 5,5
PLACE R1 0,0,EAST
PLACE R2 1,0,EAST
PLACE R3 2,0,EAST
QUEUE R1 MOVE
QUEUE R2 MOVE
QUEUE R3 MOVE
TICK
REPORT
R1 1,0,EAST
R2 2,0,EAST
R3 3,0,EAST
b) A head-on swap is blocked:
PLACE R1 0,0,EAST
PLACE R2 1,0,WEST
QUEUE R1 MOVE
QUEUE R2 MOVE
TICK
REPORT
R1 0,0,EAST
R2 1,0,WEST
c) A contested cell, and a robot stuck behind the loser:
PLACE R1 0,1,EAST
PLACE R2 2,1,WEST
PLACE R3 3,1,WEST
QUEUE R1 MOVE
QUEUE R2 MOVE
QUEUE R3 MOVE

## Original page 4

TICK
REPORT
R1 1,1,EAST
R2 2,1,WEST
R3 3,1,WEST
d) A rotation of four robots:
PLACE R1 0,0,NORTH
PLACE R2 0,1,EAST
PLACE R3 1,1,SOUTH
PLACE R4 1,0,WEST
QUEUE R1 MOVE
QUEUE R2 MOVE
QUEUE R3 MOVE
QUEUE R4 MOVE
TICK
REPORT
R1 0,1,NORTH
R2 1,1,EAST
R3 1,0,SOUTH
R4 0,0,WEST
e) Queues of different lengths:
FLOOR 4,3
PLACE R2 0,0,NORTH
PLACE R1 3,2,WEST
QUEUE R2 MOVE RIGHT MOVE MOVE MOVE MOVE
QUEUE R1 MOVE LEFT
TICK 3
REPORT
TICK 10
REPORT
R1 2,2,SOUTH
R2 1,1,EAST
R1 2,2,SOUTH
R2 3,1,EAST
2. Depth modules (choose at least two)
Each module is judged on how complete and correct it is and on how clearly you explain the 
design choices behind it. Tell us in your README which modules you chose and why.
Module A: Pathfinding (GOTO X,Y)
• A new command, GOTO X,Y, stays at the front of the robot’s queue until the robot 
arrives or gives up.
• On each tick, a robot running GOTO finds a shortest path (four directions) to the target. 
It treats obstacles, the floor edge, and every other robot’s current cell as walls. It then 

## Original page 5

faces the first step of that path and makes a normal MOVE for that tick, following all the 
rules in 1.3. Turning to face the step is free.
• If several first steps lead to equally short paths, prefer them in this order: NORTH, EAST, 
SOUTH, WEST.
• If there’s no path, the robot waits. After 3 ticks in a row with no path, the GOTO is 
dropped and an UNREACHABLE event is logged.
• GOTO finishes on the tick the robot arrives.
• Add a way to issue GOTO from the UI, such as shift-clicking a cell with a robot selected.
Module B: Battery and chargers
• Every robot starts with 100 battery.
• A successful MOVE costs 1. Turning is free. A blocked MOVE doesn’t consume battery.
• A robot with 0 battery can’t move. Its MOVE is blocked with the reason NO_BATTERY.
• Any cell can be a charger. A robot that ends a tick on a charger gains 10 battery, up to a 
maximum of 100.
• The UI shows each robot’s battery.
• Scenario runner additions: CHARGER X,Y, plus REPORT BATTERY, which prints Rn 
<battery> per robot.
 FLOOR 3,1
PLACE R1 0,0,EAST
QUEUE R1 MOVE MOVE MOVE
TICK 3
REPORT BATTERY
 R1 97
Module C: Timeline and fork
• A timeline scrubber lets you view the floor exactly as it was at any earlier tick. This 
view is read-only.
• Fork from here creates a new, separate floor whose history is identical up to the 
chosen tick. After that, the two floors change independently.
• Tell us how you rebuild past states (full replay, snapshots, or a mix) and what that costs 
as history grows.
Module D: Multiple users in real time
• Two or more browser tabs (or people) looking at the same floor see each other’s changes 
live, without refreshing.
• The server is the single source of truth for ticks. Only one tick loop may run per 
floor, however many clients have Play pressed.
• If two clients make conflicting changes (for example, both place a robot on the same cell 
at the same moment), exactly one succeeds. The other client is told why, and its UI 
catches up without a refresh.
• Explain in writing how you would test this, even if you can’t automate all of it.

## Original page 6

3. What you hand in
A GitHub repository containing:
1. The source. Use any component-based frontend (Angular, React, Vue, Svelte, and so 
on). The API must be Node.js, and we suggest NestJS. The database must be SQLite.
2. README.md covering setup, how to run the app and the scenario runner, which 
modules you picked, and what’s missing.
3. Tests.
– Unit tests for the tick engine. We expect these to go well beyond the five 
examples above.
– Your own scenario files in a scenarios/ folder.
– At least one test at the API or integration level.
– If you run out of time, list the tests you would have written.
4. DECISIONS.md listing every assumption and design decision you made, with your 
reasoning. Some behaviour in this brief is deliberately left undefined, and there 
may be a contradiction or two. We care a lot about whether you notice these and how 
you resolve them.
5. AI_USAGE.md, a short, honest log of how you used AI tools. Include what you asked for, 
what you accepted, what you rejected or rewrote, and why. One or two concrete 
examples where the AI was wrong and you caught it are worth more than a long list. 
Using AI a lot is fine; this log is where you show your judgement.
6. A readable commit history. Please don’t squash everything into a single commit. 
We’ll read the history.
4. Time box
Aim for about 6 hours. The scope is deliberately bigger than that. Put the core first, then your 
two modules. List everything you cut in the README.
5. The follow-up interview (about 90 minutes)
This is where most of the evaluation happens. Plan for:
• A walkthrough (15 min). You walk us through your engine and your key decisions.
• A live change (30–40 min). We give you a new requirement you haven’t seen and you 
add it to your code while sharing your screen. You can use AI tools during this.
• Debugging (20 min). We’ll have made a small change to a copy of your repo that 
breaks something. You find it and fix it.
• Trade-offs (15 min). We discuss your DECISIONS.md and what you’d do differently 
with another week.
6. What we look for
• Correctness of the tick engine, including edge cases the examples don’t cover.
• Judgement: what you built, what you cut, and how you handled gaps in the spec.

## Original page 7

• Code quality: readable, organised, and easy to change. The engine should be pure and 
testable, separate from the framework and the database.
• Testing: tests that would catch real regressions.
• Communication: clear docs and honest descriptions of trade-offs.
• Ownership: in the follow-up, you can explain and change any part of your code.
We don’t expect a pixel-perfect UI. Something clear and usable is enough.
