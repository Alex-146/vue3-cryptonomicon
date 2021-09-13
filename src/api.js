// https://www.cryptocompare.com/cryptopian/api-keys

import EventEmitter from "events"

export const emitter = new EventEmitter()

const data = {
  apiKey: process.env.VUE_APP_API_KEY ?? "",
  socket: null
}

function sendMessage(message) {
  message = JSON.stringify(message)
  if (data.socket.readyState === WebSocket.OPEN) {
    data.socket.send(message)
  }
  else {
    data.socket.addEventListener("open", () => {
      data.socket.send(message)
    }, { once: true })
  }
}

export function connect() {
  data.socket = new WebSocket(`wss://streamer.cryptocompare.com/v2?api_key=${data.apiKey}`)

  data.socket.addEventListener("message", event => {
    const response = JSON.parse(event.data)
    const { TYPE, MESSAGE, FROMSYMBOL, PRICE } = response
    
    if (TYPE === "20") {
      emitter.emit("connection", true)
    }
    else if (TYPE === "401") {
      console.log(401, MESSAGE)
      emitter.emit("connection", false)
    }
    else if (TYPE === "429") {
      if (MESSAGE === "TOO_MANY_SOCKETS_MAX_1_PER_CLIENT") {
        console.log("already connected")
      }
      else {
        console.log(response)
      }
    }
    else if (TYPE === "500") {
      if (MESSAGE === "INVALID_SUB" || MESSAGE === "SUBSCRIPTION_UNRECOGNIZED") {
        console.log("invalid sub", response.PARAMETER)
      }
      else {
        console.log(response)
      }
    }
    else if (TYPE === "5") {
      if (PRICE) {
        emitter.emit("price", FROMSYMBOL, PRICE)
      }
    }
  })

  data.socket.addEventListener("close", event => {
    emitter.emit("close")
  })
}

export function subscribeToTickerUpdate(name) {
  // if subscribing starts when component is mounted, then there is no api key validation and socket.readyState error (socket is undefined idk for what)
  if (!data.socket) return

  sendMessage({
    action: "SubAdd",
    subs: [`5~CCCAGG~${name}~USD`]
  })
}

export function unsubscribeToTickerUpdate(name) {
  sendMessage({
    action: "SubRemove",
    subs: [`5~CCCAGG~${name}~USD`]
  })
}

export function compareTo() {
  return "USD"
}

export function getApiKey() {
  return data.apiKey
}

export function setApiKey(value) {
  data.apiKey = value
}

export async function fetchCoinList() {
  const response = await window.fetch("https://min-api.cryptocompare.com/data/all/coinlist?summary=true")
  const data = await response.json()
  return Object.values(data["Data"]).map(({ Symbol, FullName }) => ({ Symbol, FullName }))
}
