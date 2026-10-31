## Technology Stack Breakdown (0.25 - 0.5 hours)
With a chat (Codex). While I was specified to NestJS and SQLite, there are still other impactful decisions to make -- mainly the frontend. So the first chat was determining the best fit. This is because my main full-stack work has been with Elixir + Phoenix. While I've done some work with Angular, Vue, and Svelte along with Typescript in general, this has not been a daily or common technology stack.

I rejected any ReactJS usage, as it has always been a handful to deal with. It requires more understanding than I have time to afford. So it was decided to work with Svelte + Vite for the frontend.

I also used this chat to help discover how I might better connect with and understand this technology stack.

Lastly, since it was not brought up by Codex, I looked around for testing frameworks to use with this tech stack. Landing on Vitest and Jest (though it seemed Vitest was ample for the most part).

## Architecture (2 - 2.5 hours)
This is the *most* important part of the project, as it lays out what is possible in the system. This is important, especially with the modules pre-chosen, rather than trying to add them ad-hoc. Architectural decisions are where I spent a majority of time. This is because nailing down the ambiguities, objects, and more cannot easily be undone.

Personally, I thought about what general architecture would fit; namely in an object oriented fashion. I knew we had a world coordinate grid (where 1 < x & y < 20), where each cell can have various states (occupied by another robot or an obstacle/wall). There are robots who have direction, and designator (ID); along with a command queue. Though robot commands are a subset of the simulators DSL. The whole DSL containing the layout of the world (FLOOR), robot placement (PLACE), queue movement (QUEUE \<ID> MOVE), time movement (TICK) and REPORT. So we'll need a parser and command handler. Given we have a known world layout, robot movement, and ticks I believe this lends itself to a State Machine. Using a State Machine will keep movement of the system (ticks) easier to reason about. It also "locks down" what can happen in the world given the instruction/command. Plus, it gives us replayability and strict world states without ambiguity, given that we can record the world and robot state in the database.

My decisions of modules A and B also drove the architecture decision. Mainly battery occurs per tick, and can keep changing even when no other World events occur. Additionally, the GOTO command is affected by the World's state and how PLACE works as well. 

Decisions (architectural and not) are defined in:
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DECISIONS.md](./DECISIONS.md)

## Implementation Planning and Structuring (0.5 hours)
I am *not* a fan of trying to cram various responsibilities into a single chat. Not just for context window reasons, but also for focus. Driving the AI/LLM into various directions in a single chat often cause confusion on both ends. This can especially occur in *long* implementation/coding session - often seen with "vibe-coders." 

I broke down to a minimal of three other documents:
- Frontend
- Backend
	- Potentially DB/schemas separately
- Design UI/UX

These also include various hand-off documents between chats that were used above.

--- 10/31 ---

## Implementation
