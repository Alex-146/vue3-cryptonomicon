<template>
  <div class="container">
    <div class="api-group">
      <h1>Api</h1>
      <input type="text" v-model="apiKey">
      <button @click="updateApiKey" :disabled="!keyWasChanged">Update</button>
      <button v-if="keyWasChanged" @click="restoreApiKey">Restore</button>
    </div>
    <div class="input-group">
      <div class="input">
        <h1>Ticker</h1>
        <input type="text" v-model="tickerName" @keydown.enter="addTicker">
        <button @click="addTicker" :disabled="tickerName.trim().length === 0">Add</button>
      </div>
      <div class="match-group">
        <p v-if="coinData.isLoading">Loading...</p>
        <button v-for="(name, i) in truncatedTickerMatches" :key="i" @click="addMatchedTicker(name)">{{ name }}</button>
      </div>
      <div class="input">
        <h1>Filter</h1>
        <input type="text" v-model="filter">
      </div>
    </div>
    <div class="list-group">
      <h1>Tickers</h1>
      <div v-if="paginatedTickers.length > 0" class="ticker-grid">
        <div
          v-for="(ticker, i) in paginatedTickers"
          :key="i"
          @click="selectedTicker = ticker"
          class="ticker-element"
        >
          <p>{{ ticker.name }} - {{ compareTo }}</p>
          <p>{{ ticker.price }}</p>
          <p v-if="ticker.lastUpdate">{{ new Date(ticker.lastUpdate).toString() }}</p>
          <button @click.stop="removeTicker(ticker.name)">Remove</button>
        </div>
      </div>
      <p v-else>No tickers available</p>
    </div>
    <div class="page-group" v-if="pageAmount > 1">
      <button :disabled="pageIndex === 0" @click="pageIndex--">&laquo;</button>
      <button
        v-for="page in pageAmount"
        :key="page"
        :disabled="page - 1 === pageIndex"
        @click="pageIndex = page - 1"
      >{{ page }}</button>
      <button :disabled="pageIndex === pageAmount - 1" @click="pageIndex++">&raquo;</button>
    </div>
    <div class="graph-group">
      <h1>Graph</h1>
      <p v-if="selectedTicker">{{ selectedTicker.name }}</p>
      <p v-else>No data available</p>
    </div>
    <div class="config-group">
      <h1>Config</h1>
      <div class="input-group">
        <span>Display Amount</span>
        <input type="number" :value="config.displayAmount" @blur="config.displayAmount = +$event.target.value">
      </div>
    </div>
  </div>
</template>

<script>
import {
  getApiKey,
  setApiKey,
  compareTo,
  fetchCoinList,
  emitter,
  connect,
  subscribeToTickerUpdate,
  unsubscribeToTickerUpdate,
} from "./api"

export default {
  name: 'App',
  components: {
  },
  data() {
    return {
      apiKey: "",
      tickerName: "",
      filter: "",
      selectedTicker: "",
      tickers: [],
      pageIndex: 0,
      config: {
        displayAmount: 6,
      },
      coinData: {
        list: [],
        isLoading: false,
        maxCount: 4
      }
    }
  },
  async mounted() {
    this.apiKey = getApiKey()

    this.coinData.isLoading = true
    this.coinData.list = await fetchCoinList()
    this.coinData.isLoading = false

    this.initEvents()
    connect()

    this.loadTickers()
  },
  watch: {
    tickers() {
      // when last ticker on page is deleted we need to open previous page
      if (this.startIndex === this.endIndex && this.pageIndex > 0) {
        this.pageIndex--
        console.log("page moved to previous")
      }
      this.saveTickers()
    },
    filter() {
      this.pageIndex = 0
    }
  },
  methods: {
    updateApiKey() {
      setApiKey(this.apiKey)
    },
    restoreApiKey() {
      this.apiKey = getApiKey()
    },
    addTicker() {
      if (this.tickerAlreadyExists()) {
        alert("ticker already exists")
        return
      }

      this.createTicker(this.tickerName.toUpperCase())
      this.tickerName = ""
    },
    createTicker(name) {
      subscribeToTickerUpdate(name)
      const ticker = { name, price: "-" }
      this.tickers = [...this.tickers, ticker]
    },
    removeTicker(name) {
      if (this.selectedTicker?.name === name) {
        this.selectedTicker = null
      }
      unsubscribeToTickerUpdate(name)
      this.tickers = this.tickers.filter(t => t.name !== name)
    },
    tickerAlreadyExists() {
      return this.tickers.map(t => t.name.toUpperCase()).includes(this.tickerName.toUpperCase())
    },
    addMatchedTicker(name) {
      this.tickerName = name
      this.addTicker()
    },
    saveTickers() {
      window.localStorage.setItem("tickers", JSON.stringify(this.tickers.map(t => t.name)))
    },
    loadTickers() {
      const tickersData = window.localStorage.getItem("tickers")
      if (tickersData) {
        const names = JSON.parse(tickersData)
        names.forEach(name => {
          this.createTicker(name)
        })
      }
    },
    initEvents() {
      emitter.on("connection", (success) => {
        console.log("connection", success)
        // does better subscribe for updates here?
      })

      emitter.on("close", () => {
        console.log("connection closed")
      })

      emitter.on("price", (name, value) => {
        console.log(name, value)
        const ticker = this.tickers.find(t => t.name === name)
        ticker.price = value
        ticker.lastUpdate = Date.now()
      })
    }
  },
  computed: {
    keyWasChanged() {
      return this.apiKey !== getApiKey()
    },
    compareTo() {
      return compareTo()
    },
    filteredTickers() {
      return this.tickers.filter(t => t.name.toUpperCase().includes(this.filter.toUpperCase()))
    },
    paginatedTickers() {
      return this.filteredTickers.slice(this.startIndex, this.endIndex)
    },
    pageAmount() {
      return Math.ceil(this.filteredTickers.length / this.config.displayAmount)
    },
    startIndex() {
      return this.pageIndex * this.config.displayAmount
    },
    endIndex() {
      return Math.min(this.startIndex + this.config.displayAmount, this.filteredTickers.length)
    },
    tickerMatches() {
      if (this.tickerName.trim().length === 0) return []

      // 40-50 ms for this action
      const matches = this.coinData.list
        .map(entry => Object.values(entry))
        .filter(arr => arr.some(str => str.includes(this.tickerName)))
        .map(arr => arr[0])
      return matches
    },
    truncatedTickerMatches() {
      return this.tickerMatches.slice(0, Math.min(this.coinData.maxCount, this.tickerMatches.length))
    },
  },
}
</script>

<style>
* {
  margin: 0;
  pad: 0;
}

.ticker-grid {
  display: grid;
  /* grid-template-columns: repeat(5, 1fr); */
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.ticker-element {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid black;
  padding: 10px;
}
</style>
