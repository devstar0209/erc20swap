//import module
//Developed by dillonmarszal@gmail.com, +1 541 903 5668
// const { Web3 } = require("web3");
const Web3 = require("web3");
const { BigNumber } = require("@0x/utils");
const abi = require("erc-20-abi");
// const qs = require('qs');

require("dotenv").config();

const tokenList = require("./tokenList");

//define constant

const ZERO_EX_ADDRESS = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
const takerAddress = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const buyToken = "USDT";
const sellToken = "WETH";
let sellAmount = "0";
let buyTokenAddress = tokenList.find(
  (token) => token.symbol === buyToken
).address;
let sellTokenAddress = tokenList.find(
  (token) => token.symbol === sellToken
).address;

// Configuring the connection to an Ethereum node
const network = process.env.ETHEREUM_NETWORK;
let web3;
let signer;
let sellTokenContract;
let buyTokenContract;
let sellTokenDecimal;
let buyTokenDecimal;

async function config() {
  // web3 = new Web3(
  //   new Web3.providers.HttpProvider(
  //     `https://${network}.infura.io/v3/${process.env.INFURA_API_KEY}`
  //   )
  // );
  web3 = new Web3(
    `https://${network}.infura.io/v3/${process.env.INFURA_API_KEY}`
  );
  signer = web3.eth.accounts.privateKeyToAccount(
    process.env.SIGNER_PRIVATE_KEY
  );
  web3.eth.accounts.wallet.add(signer);
  sellTokenContract = new web3.eth.Contract(abi, sellTokenAddress);
  buyTokenContract = new web3.eth.Contract(abi, buyTokenAddress);
}

//Get SellToken Address

async function getSellTokenAddress(customtoken) {
  sellTokenAddress = tokenList.find(
    (token) => token.symbol === customtoken
  ).address;
}

//Get BuyToken Address

async function getBuyTokenAddress(customtoken) {
  buyTokenAddress = tokenList.find(
    (token) => token.symbol === customtoken
  ).address;
}

async function getTxQuoteFrom0xAPI() {
  try {
    await getSellTokenAddress(sellToken);

    await getBuyTokenAddress(buyToken);

    const url = `${process.env.X0_API_URL}quote?sellToken=${sellTokenAddress}&buyToken=${buyTokenAddress}&sellAmount=${sellAmount}`;
    const response = await fetch(url, {
      headers: {
        "0x-api-key": process.env.X0_API_KEY,
      },
    });

    if (!response.ok) {
      console.log(await response.json());
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    throw error;
  }
}

async function sendSignedTransaction(signedTx) {
  return new Promise((resolve, reject) => {
    web3.eth
      .sendSignedTransaction(signedTx.rawTransaction)
      .on("transactionHash", (txhash) => {
        console.log(`https://arbiscan.io/tx/${txhash}`);
        // Timestamp
        console.log(`Timestamp: ${new Date().toLocaleString()}`);
      })
      .on("receipt", (receipt) => {
        console.log(`Total Gas Used: ${receipt.gasUsed}`);
        resolve(receipt);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

async function main() {
  config();
  const balance = new BigNumber(
    await sellTokenContract.methods.balanceOf(signer.address).call()
  ).toFixed();
  console.log('balance', balance);
  sellTokenDecimal = new BigNumber(
    await sellTokenContract.methods.decimals().call()
  );
  buyTokenDecimal = new BigNumber(
    await buyTokenContract.methods.decimals().call()
  );

  

  if (balance < 1000000) {
    console.log("Balance of token is zero or too small.");
    return;
  }

  sellAmount = balance;
  
  const currentAllowance = new BigNumber(
    await sellTokenContract.methods
      .allowance(signer.address, ZERO_EX_ADDRESS)
      .call()
  );

  console.log('seel allowance', currentAllowance);
  

  if (currentAllowance.isLessThan(balance)) {
    
    try {
      const estimatedGas = await sellTokenContract.methods
        .approve(ZERO_EX_ADDRESS, sellAmount)
        .estimateGas({ from: signer.address });
        
      await sellTokenContract.methods
        .approve(ZERO_EX_ADDRESS, sellAmount)
        .send({ from: signer.address, gas: estimatedGas + 1000 }); // Adding a buffer of 10,000 gas units
    } catch (error) {
      console.error("Error during token approval:", error);
    }
  }
  const txQuote = await getTxQuoteFrom0xAPI();
  console.log('txQuote', txQuote);
  const tx = {
    from: signer.address,
    to: txQuote.to,
    // gasPrice: txQuote.gasPrice * 1.5,
	//gasLimit: 50000,
    data: txQuote.data,
    gas: Math.floor(Number(txQuote.gas) * 1.1).toString(),
  };
  // Inside your main function
  const signedTx = await web3.eth.accounts.signTransaction(
    tx,
    signer.privateKey
  );
  if (signedTx) {
    
    const receipt = await sendSignedTransaction(signedTx);
    // Calculate the price of the selling token
    var buyTokenPrice; // Price of buyToken in terms of sellToken
    var sellTokenPrice; // Invert to get price of sellToken in terms of buyToken

    if (buyToken == "USDT") {
      buyTokenPrice = "1";

      const selltokenurl = `${process.env.X0_API_URL}quote?sellToken=${sellTokenAddress}&buyToken=${buyTokenAddress}&sellAmount=${sellAmount}`;
      const response1 = await fetch(selltokenurl, {
        headers: {
          "0x-api-key": process.env.X0_API_KEY,
        },
      });

      const selltokendata = await response1.json();
      sellTokenPrice = selltokendata.price;
    } else if (sellToken == "USDT") {
      sellTokenPrice = "1";

      const buytokenurl = `${process.env.X0_API_URL}quote?sellToken=${sellTokenAddress}&buyToken=${buyTokenAddress}&sellAmount=${sellAmount}`;
      const response = await fetch(buytokenurl, {
        headers: {
          "0x-api-key": process.env.X0_API_KEY,
        },
      });

      const buytokendata = await response.json();

      buyTokenPrice = 1 / Number(buytokendata.price);
    } else {
      const buytokenurl = `${process.env.X0_API_URL}quote?sellToken=${sellTokenAddress}&buyToken=${takerAddress}&sellAmount=${sellAmount}`;
      const response = await fetch(buytokenurl, {
        headers: {
          "0x-api-key": process.env.X0_API_KEY,
        },
      });

      const buytokendata = await response.json();

      sellTokenPrice = buytokendata.price;

      const selltokenurl = `${process.env.X0_API_URL}quote?sellToken=${buyTokenAddress}&buyToken=${takerAddress}&sellAmount=${sellAmount}`;
      const response1 = await fetch(selltokenurl, {
        headers: {
          "0x-api-key": process.env.X0_API_KEY,
        },
      });

      const selltokendata = await response1.json();
      buyTokenPrice = selltokendata.price;

      if(buyTokenPrice == undefined){
        buyTokenPrice = sellTokenPrice/txQuote.price;
      }
    }

    console.log(`Price of ${sellToken} (Selling Token): ${sellTokenPrice}`);

    const sellTokenAmount =
      Number(txQuote.sellAmount) /
      Number(Math.pow(10, Number(sellTokenDecimal))).toFixed(10);
    console.log(`Amount of ${sellToken}: ${sellTokenAmount}`);

    console.log(`Price of ${buyToken} (Purchasing Token): ${buyTokenPrice}`);

    const buyTokenAmount =
      Number(txQuote.buyAmount) /
      Number(Math.pow(10, Number(buyTokenDecimal))).toFixed(10);

    console.log(`Amount of ${buyToken}: ${buyTokenAmount}`);
  }

  return;
}

async function executeScriptOnce() {
  try {
    await main();
    console.log("Script executed successfully");
  } catch (error) {
    console.error("Error executing script:", error);
  }
}

executeScriptOnce();

