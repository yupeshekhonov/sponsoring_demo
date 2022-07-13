import {init, Substrate, utils} from '@unique-nft/api'
import * as dotenv from "dotenv";

dotenv.config();

// Created collection -  1043
const chain = new Substrate.Unique()

const run = async () => {
  await init()
  await chain.connect(process.env.WS_URL)

  const keyringA = Substrate.signer.keyringFromSeed(process.env.SEED_SUB_A)
  const keyringB = Substrate.signer.keyringFromSeed(process.env.SEED_SUB_B)
  const keyringC = Substrate.signer.keyringFromSeed(process.env.SEED_SUB_C)
  const keyringD = Substrate.signer.keyringFromSeed(process.env.SEED_SUB_D)
  const Address_A = keyringA.address

  console.log('\n\n Initial balances:')
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 1
  const createdCollection = await chain.createCollection({
    collection: {
      name: 'AC',
      description: 'Alice Collection',
      tokenPrefix: 'AL',
      tokenPropertyPermissions: [{
        key: 'name',
        permission: {
          tokenOwner: false,
          collectionAdmin: true,
          mutable: false,
        }
      }]
    }
  }).signAndSend(keyringA)
  console.log('Created collection - ', createdCollection.collectionId)

  const createdItem = await chain.createNftToken({
    collectionId: createdCollection.collectionId, token: {
      owner: {Substrate: keyringA.address},
      properties: [{key: 'name', value: 'Alice'}]
    }
  }).signAndSend(keyringA)
  console.log('Created item - ', createdItem.tokenId)
  console.log(`\n\nAfter step 1, the collection and the item were created. Alice paid for this. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 2
  await transferNFT(keyringA, keyringC.address, createdCollection.collectionId, createdItem.tokenId)
  console.log(`\n\nAfter step 2, token #1 was sent to Charlie. Alice paid for this. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 3
  await transferNFT(keyringC, keyringB.address, createdCollection.collectionId, createdItem.tokenId)
  console.log(`\n\nAfter step 3, token #1 was sent from Charlie to Bob. Charlie paid for this. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 4
  const createdItem2 = await chain.createNftToken({
    collectionId: createdCollection.collectionId, token: {
      owner: {Substrate: keyringA.address},
      properties: [{key: 'name', value: 'Alice2'}]
    }
  }).signAndSend(keyringA)
  await transferNFT(keyringA, keyringB.address, createdCollection.collectionId, createdItem2.tokenId)
  console.log(`\n\nAfter step 4, token #2 was created and sent from Alice to Bob. Alice paid for this. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 5 - fail
  try {
    await transferNFT(keyringB, keyringC.address, createdCollection.collectionId, createdItem2.tokenId)
  } catch {}
  console.log(`\n\nAfter step 5, Bob tried to send token #2 to Charlie, but failed to do this since his balance is 0. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 6
  const setSponsor = await chain.setCollectionSponsor({
    collectionId: createdCollection.collectionId,
    newSponsorAddress: keyringD.address
  })

  const confirm = await chain.confirmSponsorship({collectionId: createdCollection.collectionId}).signAndSend(keyringD)
  console.log(`\n\nAfter step 6, Alice set Dave as a sponsor for the collection. Dave confirmed this. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 7 - success now
  await transferNFT(keyringB, keyringC.address, createdCollection.collectionId, createdItem2.tokenId)
  console.log(`\n\nAfter step 7, Bob tried to send token #2 to Charlie, and now he was able to do this. The collection sponsor (Dave) paid for this transaction. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 8 - Dave pays
  await transferNFT(keyringC, keyringA.address, createdCollection.collectionId, createdItem2.tokenId)
  console.log(`\n\nAfter step 8, Charlie sent token #2 to Alice. The collection sponsor (Dave) paid for this transaction. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 9
  await transferNFT(keyringA, keyringC.address, createdCollection.collectionId, createdItem2.tokenId)
  console.log(`\n\nAfter step 9, Alice sent token #2 back to Charlie. The collection sponsor (Dave) paid for this transaction. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 10
  let balanceD = await chain.getBalance(keyringD.address)
  const priceToTransferMoneyFromDave = await chain.transferCoins({toAddress: keyringA.address, amountInWei: 1n}).getPaymentInfo(keyringD.address)
  await chain.transferCoins({toAddress: keyringA.address, amountInWei: balanceD - priceToTransferMoneyFromDave}).signAndSend(keyringD)
  console.log(`\n\nAfter step 10, Dave sent all UNQ to Alice so he does not have any money to pay for transactions. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 11
  await transferNFT(keyringC, keyringA.address, createdCollection.collectionId, createdItem2.tokenId)
  console.log(`\n\nAfter step 11, Charlie tries to send token #2 back to Alice, but cannot do this. The collection sponsor (Dave) does not have money to pay for this transaction. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)

  // step 12
  chain.removeCollectionSponsor({collectionId: createdCollection.collectionId})
  await transferNFT(keyringC, keyringA.address, createdCollection.collectionId, createdItem2.tokenId)
  console.log(`\n\nAfter step 12, the collection sponsor is removed. Charlie tries to send token #2 back to Alice, and he was able to do this. \n
     Charlie himself pays. Balances:`)
  await printBalances(keyringA, keyringB, keyringC, keyringD)
}

run().catch(err => console.error(err)).finally(() => chain.disconnect())


async function transferNFT(whoSends, toAddress, collectionId, tokenId) {
  return await chain.createTransactionFromRawTx(chain.getApi()!.tx.unique.transfer({Substrate: toAddress}, collectionId, tokenId, 1))
    .signAndSend(whoSends)
}

async function printBalances(keyringA, keyringB, keyringC, keyringD) {
  const [balanceA, balanceB, balanceC, balanceD] = await Promise.all([
    chain.getBalance(keyringA.address),
    chain.getBalance(keyringB.address),
    chain.getBalance(keyringC.address),
    chain.getBalance(keyringD.address)
  ])

  console.log('Alice balance is ' + chain.coin.format(balanceA))
  console.log('Bob balance is ' + chain.coin.format(balanceB))
  console.log('Charlie balance is ' + chain.coin.format(balanceC))
  console.log('Dave balance is ' + chain.coin.format(balanceD))
}
