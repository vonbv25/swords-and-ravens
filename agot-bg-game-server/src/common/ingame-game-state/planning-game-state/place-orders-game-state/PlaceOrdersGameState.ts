import GameState from "../../../GameState";
import IngameGameState from "../../IngameGameState";
import {ClientMessage} from "../../../../messages/ClientMessage";
import Player from "../../Player";
import Order from "../../game-data-structure/Order";
import Region from "../../game-data-structure/Region";
import World from "../../game-data-structure/World";
import orders from "../../game-data-structure/orders";
import {ServerMessage} from "../../../../messages/ServerMessage";
import EntireGame from "../../../EntireGame";
import {observable} from "mobx";
import * as _ from "lodash";
import BetterMap from "../../../../utils/BetterMap";
import Game from "../../game-data-structure/Game";
import House from "../../game-data-structure/House";
import User from "../../../../server/User";
import PlanningGameState from "../PlanningGameState";

export default class PlaceOrdersGameState extends GameState<PlanningGameState> {
    // Server-side, the value of the map should never be null.
    // Client-side, the client can receive a null value if it is the order of an other player,
    // it thus represents a face-down order (this player can't see it).
    @observable placedOrders: BetterMap<Region, Order | null> = new BetterMap<Region, Order | null>();
    @observable readyPlayers: Player[] = [];

    /**
     * Indiates whether this PlaceOrdersGameState phase is for vassals or for non-vassals.
     * PlanningGameState will first go through a phase for non-vassals and then a phase for vassals.
     */
    @observable forVassals: boolean;

    get ingameGameState(): IngameGameState {
        return this.parentGameState.parentGameState;
    }

    get planningGameState(): PlanningGameState {
        return this.parentGameState;
    }

    get game(): Game {
        return this.ingameGameState.game;
    }

    get world(): World {
        return this.game.world;
    }

    get entireGame(): EntireGame {
        return this.ingameGameState.entireGame;
    }

    firstStart(orders = new BetterMap<Region, Order>(), forVassals = false): void {
        this.placedOrders = orders;
        this.forVassals = forVassals;

        this.ingameGameState.log({
            type: "planning-phase-began"
        });
    }

    isOrderAvailable(house: House, order: Order): boolean {
        return this.getAvailableOrders(house).includes(order);
    }

    onPlayerMessage(player: Player, message: ClientMessage): void {
        if (message.type == "place-order") {
            const order = message.orderId ?orders.get(message.orderId) : null;
            const region = this.world.regions.get(message.regionId);
            const house = this.game.houses.get(message.house);

            if (!this.getHousesToPutOrdersForPlayer(player).includes(house)) {
                return;
            }

            if (!this.getPossibleRegionsForOrders(house).includes(region)) {
                return;
            }

            if (order && !this.isOrderAvailable(house, order)) {
                return;
            }

            if (order) {
                this.placedOrders.set(region, order);
            } else {
                if (this.placedOrders.has(region)) {
                    this.placedOrders.delete(region);
                }
            }

            if (order) {
                player.user.send({
                    type: "order-placed",
                    order: order.id,
                    region: region.id
                });

                this.ingameGameState.players.values.filter(p => p != player).forEach(p => {
                    p.user.send({
                        type: "order-placed",
                        region: region.id,
                        order: null
                    });
                });
            } else {
                this.entireGame.broadcastToClients({
                    type: "remove-placed-order",
                    regionId: region.id
                })
            }
        } else if (message.type == "ready") {
            if (this.readyPlayers.includes(player)) {
                return;
            }

            if (!this.canReady(player).status) {
                return;
            }

            this.readyPlayers.push(player);

            // Check if all player are ready to go the action entireGame state
            if (this.readyPlayers.length == this.ingameGameState.players.values.length) {
                this.planningGameState.onPlaceOrderFinish(this.forVassals, this.placedOrders as BetterMap<Region, Order>);
            } else {
                this.entireGame.broadcastToClients({
                    type: "player-ready",
                    userId: player.user.id
                });
            }
        }
    }

    getPossibleRegionsForOrders(house: House): Region[] {
        return this.game.world.getControlledRegions(house).filter(r => r.units.size > 0);
    }

    serializeToClient(admin: boolean, player: Player | null): SerializedPlaceOrdersGameState {
        const placedOrders = this.placedOrders.mapOver(r => r.id, (o, r) => {
            // Hide orders that doesn't belong to the player
            // If admin, send all orders.
            const controller = r.getController();
            if (admin || (player && controller != null && (controller == player.house || (this.ingameGameState.isVassalHouse(controller) && this.ingameGameState.isVassalControlledByPlayer(controller, player))))) {
                return o ? o.id : null;
            }
            return null;
        });

        return {
            type: "place-orders",
            placedOrders: placedOrders,
            readyPlayers: this.readyPlayers.map(p => p.user.id),
            forVassals: this.forVassals
        };
    }

    /*
     * Common
     */

    canReady(player: Player): {status: boolean; reason: string} {
        // Iterate over all the houses the player should put orders for to find
        // an error in one of the houses.
        const possibleError = this.getHousesToPutOrdersForPlayer(player).reduce((state, house) => {
            const possibleRegions = this.getPossibleRegionsForOrders(house);

            if (possibleRegions.every(r => this.placedOrders.has(r)))
            {
                // All possible regions have orders
                return state;
            }

            // It is possible that a house controls more areas than it has available orders
            if (this.getAvailableOrders(house).length == 0) {
                return state;
            }

            return {status: false, reason: "not-all-regions-filled"};
        }, null);
        
        return possibleError ? possibleError : {status: true, reason: ""};
    }

    /**
     * Client
     */

    assignOrder(house: House, region: Region, order: Order | null): void {
        this.entireGame.sendMessageToServer({
            type: "place-order",
            house: house.id,
            regionId: region.id,
            orderId: order ? order.id : null
        });
    }

    ready(): void {
        this.entireGame.sendMessageToServer({
            type: "ready"
        });
    }

    onServerMessage(message: ServerMessage): void {
        if (message.type == "order-placed") {
            const region = this.world.regions.get(message.region);
            const order = message.order ? orders.get(message.order) : null;

            this.placedOrders.set(region, order);
        } else if (message.type == "remove-placed-order") {
            const region = this.world.regions.get(message.regionId);

            if (this.placedOrders.has(region)) {
                this.placedOrders.delete(region);
            }
        } else if (message.type == "player-ready") {
            const player = this.ingameGameState.players.get(this.entireGame.users.get(message.userId));

            this.readyPlayers.push(player);
        }
    }

    getPhaseName(): string {
        return "Planning";
    }

    /**
     * Queries
     */

    /**
     * For a given player, returns all the houses for which `player` must place
     * orders for. Depending on `this.forVassals`, this may be simply the house of the
     * player, or the list of vassals commanded by the player.
     */
    getHousesToPutOrdersForPlayer(player: Player): House[] {
        if (!this.forVassals) {
            return [player.house];
        } else {
            return this.ingameGameState.getVassalsControlledByPlayer(player);
        }
    }
    
    getNotReadyPlayers(): Player[] {
        return _.difference(
            this.ingameGameState.players.values,
            this.readyPlayers
        );
    }

    getWaitedUsers(): User[] {
        return this.getNotReadyPlayers().map(p => p.user);
    }

    getAvailableOrders(house: House): Order[] {
        return this.ingameGameState.game.getAvailableOrders(this.placedOrders, house, this.parentGameState.planningRestrictions);
    }

    isOrderRestricted(order: Order): boolean {
        return this.parentGameState.planningRestrictions.some(restriction => restriction.restriction(order.type));
    }

    isReady(player: Player): boolean {
        return this.readyPlayers.includes(player);
    }

    static deserializeFromServer(planning: PlanningGameState, data: SerializedPlaceOrdersGameState): PlaceOrdersGameState {
        const placeOrder = new PlaceOrdersGameState(planning);

        placeOrder.placedOrders = new BetterMap(
            data.placedOrders.map(
                ([regionId, orderId]) => [
                    planning.world.regions.get(regionId),
                    orderId ? orders.get(orderId) : null
                ]
            )
        );
        placeOrder.readyPlayers = data.readyPlayers.map(userId => planning.ingameGameState.players.get(planning.entireGame.users.get(userId)));
        placeOrder.forVassals = data.forVassals;

        return placeOrder;
    }
}

export interface SerializedPlaceOrdersGameState {
    type: "place-orders";
    placedOrders: [string, number | null][];
    readyPlayers: string[];
    forVassals: boolean;
}
