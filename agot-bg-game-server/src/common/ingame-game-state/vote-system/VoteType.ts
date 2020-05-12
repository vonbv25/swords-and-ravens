import IngameGameState from "../IngameGameState";
import Vote from "./Vote";
import CancelledGameState from "../../cancelled-game-state/CancelledGameState";
import { User } from "@sentry/node";
import House from "../game-data-structure/House";

export type SerializedVoteType = SerializedCancelGame | SerializedReplacePlayer;

export default abstract class VoteType {
    abstract serializeToClient(): SerializedVoteType;
    abstract verb(): string;
    abstract executeAccepted(vote: Vote): void;

    static deserializeFromServer(ingame: IngameGameState, data: SerializedVoteType): VoteType {
        switch (data.type) {
            case "cancel-game":
                // eslint complains because CancelGame is defined later in the file while
                // it's used in a static function here.
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                return CancelGame.deserializeFromServer(ingame, data);
            case "replace-player":
                // Same than above
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                return ReplacePlayer.deserializeFromServer(ingame, data);
        }
    }
}

export class CancelGame extends VoteType {
    verb(): string {
        return "cancel the game";
    }

    executeAccepted(vote: Vote): void {
        vote.ingame.setChildGameState(new CancelledGameState(vote.ingame    )).firstStart();
    }

    serializeToClient(): SerializedCancelGame {
        return {
            type: "cancel-game"
        };
    }
    
    static deserializeFromServer(_ingame: IngameGameState, _data: SerializedCancelGame): CancelGame {
        return new CancelGame();
    }
}

export interface SerializedCancelGame {
    type: "cancel-game";
}

export class ReplacePlayer extends VoteType {
    userToReplace: User;
    forHouse: House;

    constructor(userToReplace: User, forHouse: House) {
        super();
        this.userToReplace = userToReplace;
        this.forHouse = forHouse;
    }

    verb(): string {
        return `replace ${this.userToReplace.name} (${this.forHouse.name})`;
    }

    executeAccepted(vote: Vote): void {
    }

    serializeToClient(): SerializedReplacePlayer {
        return {
            type: "replace-player",
            userToReplace: this.userToReplace.id,
            forHouse: this.forHouse.id
        };
    }
    
    static deserializeFromServer(ingame: IngameGameState, data: SerializedReplacePlayer): ReplacePlayer {
        const userToReplace = ingame.entireGame.users.get(data.userToReplace);
        const forHouse = ingame.game.houses.get(data.forHouse);

        return new ReplacePlayer(userToReplace, forHouse);
    }
}

export interface SerializedReplacePlayer {
    type: "replace-player";
    userToReplace: string;
    forHouse: string;
}