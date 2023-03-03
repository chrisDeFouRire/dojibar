```json
EVENTTYPE:  ACCOUNT_CONFIG_UPDATE
{
  eventType: 'ACCOUNT_CONFIG_UPDATE',
  eventTime: 1649797839997,
  transactionTime: 1649797839990,
  type: 'ACCOUNT_CONFIG',
  symbol: '1000SHIBUSDT',
  leverage: 10
}
```

```json
EVENTTYPE:  ACCOUNT_UPDATE
{
  eventTime: 1649797926144,
  transactionTime: 1649797926138,
  eventType: 'ACCOUNT_UPDATE',
  eventReasonType: 'ORDER',
  balances: [
    {
      asset: 'USDT',
      walletBalance: '2936.51738994',
      crossWalletBalance: '2936.51738994',
      balanceChange: '0'
    }
  ],
  positions: [
    {
      symbol: '1000SHIBUSDT',
      positionAmount: '-11234',
      entryPrice: '0.026148',
      accumulatedRealized: '4.33201799',
      unrealizedPnL: '-0.43812600',
      marginType: 'cross',
      isolatedWallet: '0',
      positionSide: 'BOTH'
    },
    {
      symbol: '1000SHIBUSDT',
      positionAmount: '0',
      entryPrice: '0.000000',
      accumulatedRealized: '-19.45292800',
      unrealizedPnL: '0',
      marginType: 'cross',
      isolatedWallet: '0',
      positionSide: 'LONG'
    }
  ]
}
```