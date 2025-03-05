/**
 * Computes the bin probabilities for a given row count.
 * 
 * @param {number} rowCount Number of rows.
 * @returns {number[]} The probability for each bin.
 */
function computeBinProbabilities(rowCount) {
    const p = 0.5; // Probability of success on a single trial
    const probabilities = [];
  
    for (let k = 0; k <= rowCount; k++) {
      const binomialCoefficient = factorial(rowCount) / (factorial(k) * factorial(rowCount - k));
      const probability = binomialCoefficient * Math.pow(p, k) * Math.pow(1 - p, rowCount - k);
      probabilities.push(probability);
    }
  
    return probabilities;
  }
  
  /**
   * Computes the factorial of a given number.
   * 
   * @param {number} n Number to calculate factorial of.
   * @returns {number} The factorial of n.
   */
  function factorial(n) {
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }
  

  // utils.js

/**
 * Get a random number between two values.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} - A random number between min and max.
 */
const getRandomBetween = (min, max) => {
  return Math.random() * (max - min) + min;
};

module.exports = { getRandomBetween };