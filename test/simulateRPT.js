const { binPayouts } = require('./constants'); // assuming your constants file is in the constants folder
  // Assuming your types file has the RiskLevel and RowCount enums
// const { getRandomBetween } = require('./numbers'); // utility to generate random numbers

const factorial = (n) => (n === 0 ? 1 : n * factorial(n - 1));

// Example Run
const rowCount = parseInt(process.argv[2]);
const riskLevel = process.argv[0].toUpperCase;
const betAmount = parseInt(process.argv[1]);


const calculateRTP = (rowCount, riskLevel, payouts) => {
  let rtp = 0;
  
  // Binomial probability distribution
  let probabilityDistribution = Array(rowCount + 1).fill(0);
  for (let k = 0; k <= rowCount; k++) {
      probabilityDistribution[k] = Math.pow(0.5, rowCount) * 
        (factorial(rowCount) / (factorial(k) * factorial(rowCount - k)));
  }

  // Adjust probability based on risk level
  if (riskLevel === 'HIGH') {
      probabilityDistribution = probabilityDistribution.map(p => p * 1.2);
  } else if (riskLevel === 'LOW') {
      probabilityDistribution = probabilityDistribution.map(p => p * 0.8);
  }

  // Normalize probability
  const totalProb = probabilityDistribution.reduce((sum, p) => sum + p, 0);
  probabilityDistribution = probabilityDistribution.map(p => p / totalProb);

  // Calculate RTP as the sum of (probability × multiplier)
  for (let i = 0; i < probabilityDistribution.length; i++) {
      rtp += probabilityDistribution[i] * payouts[rowCount][riskLevel][i];
  }

  return rtp * 100; // Convert to percentage
};

const rtp = calculateRTP(rowCount, riskLevel, binPayouts);

console.log(`Estimated RTP for ${riskLevel} risk level: ${rtp.toFixed(2)}%`);