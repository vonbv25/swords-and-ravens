import {Component, ReactNode} from "react";
import orders from "../../common/ingame-game-state/game-data-structure/orders";
import {observable} from "mobx";
import {observer} from "mobx-react";
import Order from "../../common/ingame-game-state/game-data-structure/Order";
import React from "react";
import Region from "../../common/ingame-game-state/game-data-structure/Region";
import * as _ from "lodash";
import ListGroupItem from "react-bootstrap/ListGroupItem";
import GameStateComponentProps from "./GameStateComponentProps";
import Button from "react-bootstrap/Button";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import OrderGridComponent from "./utils/OrderGridComponent";
import {OrderOnMapProperties, RegionOnMapProperties} from "../MapControls";
import PartialRecursive from "../../utils/PartialRecursive";
import PlaceOrdersGameState from "../../common/ingame-game-state/planning-game-state/place-orders-game-state/PlaceOrdersGameState";
import Player from "../../common/ingame-game-state/Player";
import House from "../../common/ingame-game-state/game-data-structure/House";

@observer
export default class PlaceOrdersComponent extends Component<GameStateComponentProps<PlaceOrdersGameState>> {
    @observable selectedOrder: Order | null;
    @observable forWhichHouse: House | null;
    modifyRegionsOnMapCallback: any;
    modifyOrdersOnMapCallback: any;

    get player(): Player {
        if (!this.props.gameClient.authenticatedPlayer) {
            throw new Error();
        }

        return this.props.gameClient.authenticatedPlayer;
    }

    get housesToPlaceOrdersFor(): House[] {
        return this.props.gameState.getHousesToPutOrdersForPlayer(this.player);
    }

    get forVassals(): boolean {
        return this.props.gameState.forVassals;
    }

    render(): ReactNode {
        return (
            <>
                <ListGroupItem>
                    <Row>
                        <Col xs={12}>
                            {!this.forVassals ? (
                                <>Players may now assign orders in each region where they possess at least one unit</>
                            ) : (
                                <>Players may now assign orders for their vassals</>
                            )}
                        </Col>
                        {this.props.gameClient.authenticatedPlayer && this.housesToPlaceOrdersFor.length > 0 && (
                            this.housesToPlaceOrdersFor.map(house => (
                                <React.Fragment key={house.id}>
                                    {this.forVassals && (
                                        <Col xs={12} className="text-center">
                                            <b>Orders for {house.name}</b>
                                        </Col>
                                    )}
                                    <Col xs={12}>
                                        <OrderGridComponent orders={orders.values}
                                                            selectedOrder={this.forWhichHouse == house ? this.selectedOrder : null}
                                                            availableOrders={
                                                                this.props.gameState.getAvailableOrders(house)
                                                            }
                                                            onOrderClick={o => this.selectOrder(house, o)}/>
                                    </Col>
                                </React.Fragment>
                            ))
                        )}
                        <Col xs={12}>
                            {this.props.gameClient.authenticatedPlayer && !this.props.gameState.readyPlayers.includes(this.props.gameClient.authenticatedPlayer) ? (
                                <Row className="justify-content-center">
                                    <Col xs="auto">
                                        <Button
                                            disabled={this.props.gameState.isReady(this.props.gameClient.authenticatedPlayer)
                                                || !this.props.gameState.canReady(this.props.gameClient.authenticatedPlayer).status}
                                            onClick={() => this.onReadyClick()}
                                        >
                                            Ready
                                        </Button>
                                    </Col>
                                </Row>
                            ) : (
                                <div className="text-center">
                                    Waiting for {this.props.gameState.getNotReadyPlayers().map(p => p.house.name).join(', ')}...
                                </div>
                            )}
                        </Col>
                    </Row>
                </ListGroupItem>
            </>
        );
    }

    selectOrder(house: House, order: Order): void {
        if (this.selectedOrder == order && this.forWhichHouse == house) {
            this.selectedOrder = null;
        } else {
            this.forWhichHouse = house;
            this.selectedOrder = order;
        }
    }

    isOrderAvailable(order: Order): boolean {
        if (!this.props.gameClient.authenticatedPlayer) {
            return false;
        }
        return this.props.gameState.isOrderAvailable(this.props.gameClient.authenticatedPlayer.house, order);
    }

    componentDidMount(): void {
        this.props.mapControls.modifyRegionsOnMap.push(this.modifyRegionsOnMapCallback = () => this.modifyRegionsOnMap());
        this.props.mapControls.modifyOrdersOnMap.push(this.modifyOrdersOnMapCallback = () => this.modifyOrdersOnMap());
    }

    componentWillUnmount(): void {
        _.pull(this.props.mapControls.modifyRegionsOnMap, this.modifyRegionsOnMapCallback);
        _.pull(this.props.mapControls.modifyOrdersOnMap, this.modifyOrdersOnMapCallback);
    }

    modifyRegionsOnMap(): [Region, PartialRecursive<RegionOnMapProperties>][] {
        if (this.selectedOrder != null && this.forWhichHouse != null) {
            return this.props.gameState.getPossibleRegionsForOrders(this.forWhichHouse).map(r => ([
                r,
                {
                    highlight: {active: true},
                    onClick: () => this.onRegionClick(r)
                }
            ]));
        }

        return [];
    }

    modifyOrdersOnMap(): [Region, PartialRecursive<OrderOnMapProperties>][] {
        if (this.props.gameClient.authenticatedPlayer && this.forWhichHouse != null) {
            return this.props.gameState.getPossibleRegionsForOrders(this.forWhichHouse).map(r => ([
                r,
                {
                    onClick: () => this.onOrderClick(r)
                }
            ]));
        }

        return [];
    }

    onRegionClick(region: Region): void {
        if (!this.props.gameClient.authenticatedPlayer) {
            return;
        }

        if (this.selectedOrder != null && this.forWhichHouse != null) {
            this.props.gameState.assignOrder(this.forWhichHouse, region, this.selectedOrder);
            this.selectedOrder = null;
            this.forWhichHouse = null;
        }
    }

    onOrderClick(region: Region): void {
        if (!this.props.gameClient.authenticatedPlayer) {
            return;
        }

        if (this.selectedOrder != null && this.forWhichHouse != null) {
            this.props.gameState.assignOrder(this.forWhichHouse, region, this.selectedOrder);
            this.selectedOrder = null;
        } else {
            this.props.gameState.assignOrder(region.getController() as House, region, null);
        }
    }

    onReadyClick(): void {
        this.props.gameState.ready();
    }
}
