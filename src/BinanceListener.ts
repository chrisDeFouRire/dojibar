import * as Mongodb from "mongodb";
import amqplib from 'amqplib';
import { Telegraf } from "telegraf";
import { Dictionary } from "lodash";
import { ReconnectingWebSocketHandler, Symbol } from 'binance-api-node';
import { BinanceKey, DojibarContext, DojibarSessionData, ListenerCommand, UserSession } from "./types.js";
import { SUB_CHANGED_EXCHANGE } from "./types.js";

export abstract class BinanceListener {
	db: Mongodb.Db;
	rabbit: amqplib.Connection;
	symbols: Dictionary<Symbol> = {};
	bot?: Telegraf<DojibarContext>;

	private listeners: Dictionary<ReconnectingWebSocketHandler> = {};

	constructor(db: Mongodb.Db, rabbit: amqplib.Connection) {
		this.db = db;
		this.rabbit = rabbit;
	}

	async startRabbitListener() {
		const channel = await this.rabbit.createChannel();
		const queue = await channel.assertQueue('', { exclusive: true });
		await channel.bindQueue(queue.queue, SUB_CHANGED_EXCHANGE, ''); // TODO use shardId instead of '' when binding, and change to direct exchange from fanout

		channel.consume(queue.queue, (msg) => {
			if (!msg)
				return;

			const m: ListenerCommand = JSON.parse(msg.content.toString());
			console.log(this.kind(), " listener received from rabbitmq", m);
			switch (m.type) {
				case "STOP":
					this.stop(m.userId); break;
				case "START":
					this.listen(m.userId); break;
				case "RESTART":
					this.stop(m.userId);
					this.listen(m.userId); break;
			}
			channel.ack(msg);
		});
	}

	/**
	 * Stop a listener
	 * @param userId the userId
	 * @returns true if listener stopped
	 */
	protected stop(userId?: number): boolean {
		if (!userId) {
			return false;
		}
		const stopFn = this.listeners[userId.toString()];
		if (stopFn) {
			console.log(this.kind(), "listener stopping for user", userId);
			stopFn();
			this.unsetListener(userId);
			return true;
		}
		console.log(this.kind(), "listener not found for user", userId);
		return false;
	}

	protected hasListener(userId: number) {
		return this.listeners[userId.toString()];
	}

	protected setListener(userId: number, stop: ReconnectingWebSocketHandler) {
		this.listeners[userId.toString()] = stop;
	}

	protected unsetListener(userId: number) {
		delete this.listeners[userId.toString()];
	}

	protected abstract listen(userId: number): Promise<void>
	abstract kind(): string
}

export class ListenerCommander {
	private channel: amqplib.Channel

	constructor(channel: amqplib.Channel) {
		this.channel = channel
	}

	private sendCommandToListeners(m: ListenerCommand) {
		this.channel.publish(SUB_CHANGED_EXCHANGE, '', Buffer.from(JSON.stringify(m)))
		console.log("publishing", m)
	}

	startListeners(s: DojibarSessionData) {
		console.log("starting", s.chatId)
		this.sendCommandToListeners({
			userId: s.chatId,
			type: "START"
		})
	}

	stopListeners(s: DojibarSessionData) {
		console.log("stopping", s.chatId)
		this.sendCommandToListeners({
			userId: s.chatId,
			type: "STOP"
		})

	}

	restartListeners(s: DojibarSessionData) {
		console.log("restarting", s.chatId)
		this.sendCommandToListeners({
			userId: s.chatId,
			type: "RESTART"
		})

	}
}

