# Tradeshift automation

### Setup cmds

```sh
npm i
```

```sh
npm i -g pm2
```

```sh
npm install pm2-windows-startup -g
```

```sh
npx playwright install chromium
```

```sh
pm2 start server.js --name tradeshift_automation
pm2 save
pm2-startup install
```
