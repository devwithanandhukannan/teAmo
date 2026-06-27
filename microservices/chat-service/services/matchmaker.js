import { redisClient } from '../config/db.js';

/**
 * Helper to generate all combinations of an array, sorted by size descending.
 * For example: ['A', 'B', 'C'] ->
 * Size 3: [['A', 'B', 'C']]
 * Size 2: [['A', 'B'], ['A', 'C'], ['B', 'C']]
 * Size 1: [['A'], ['B'], ['C']]
 */
const getInterestCombinations = (arr) => {
  const result = [];
  
  const fork = (index, current) => {
    if (index === arr.length) {
      if (current.length > 0) {
        result.push(current);
      }
      return;
    }
    fork(index + 1, [...current, arr[index]]);
    fork(index + 1, current);
  };
  
  fork(0, []);
  
  // Sort by size descending
  return result.sort((a, b) => b.length - a.length);
};

/**
 * Add a user to the Redis matching pool.
 */
export const addUserToMatchingPool = async (userId, interests = []) => {
  const cleanInterests = interests.filter(i => typeof i === 'string' && i.trim().length > 0);
  
  const multi = redisClient.multi();
  
  // Add to active seekers set
  multi.sAdd('seekers', userId);
  
  // Store user's specific interests to allow deletion during matching
  multi.del(`user_interests:${userId}`);
  if (cleanInterests.length > 0) {
    multi.sAdd(`user_interests:${userId}`, cleanInterests);
    
    // Add user to each interest set
    cleanInterests.forEach(interest => {
      multi.sAdd(`interest:${interest.toLowerCase().trim()}`, userId);
    });
  }
  
  await multi.exec();
};

/**
 * Remove a user from the Redis matching pool.
 */
export const removeUserFromMatchingPool = async (userId) => {
  // Fetch user's registered interests first
  const interests = await redisClient.sMembers(`user_interests:${userId}`);
  
  const multi = redisClient.multi();
  multi.sRem('seekers', userId);
  multi.del(`user_interests:${userId}`);
  
  if (interests && interests.length > 0) {
    interests.forEach(interest => {
      multi.sRem(`interest:${interest.toLowerCase().trim()}`, userId);
    });
  }
  
  await multi.exec();
};

/**
 * Scan matching pool and try to find the best match for the user.
 * If a match is found, both users are removed from the pool.
 * If no match is found, the user is added to the pool.
 */
export const findMatchForUser = async (userId, interests = []) => {
  const cleanInterests = interests.filter(i => typeof i === 'string' && i.trim().length > 0);
  
  // Remove user from pool first to avoid matching with self
  await removeUserFromMatchingPool(userId);
  
  // If user has no interests, try to find any random seeker
  if (cleanInterests.length === 0) {
    const candidate = await getRandomSeeker(userId);
    if (candidate) {
      await removeUserFromMatchingPool(candidate);
      return { candidateId: candidate, sharedCount: 0, sharedInterests: [] };
    }
    // No one available, add self to pool and return null
    await addUserToMatchingPool(userId, interests);
    return null;
  }
  
  // Generate all interest combinations (sorted from 4 interests down to 1)
  const combinations = getInterestCombinations(cleanInterests);
  
  // We can pipeline intersections for all combinations
  const pipeline = redisClient.multi();
  combinations.forEach(combo => {
    // Intersect interest sets and seekers to ensure candidates are currently looking
    const keys = combo.map(interest => `interest:${interest.toLowerCase().trim()}`);
    keys.push('seekers');
    pipeline.sInter(keys);
  });
  
  const results = await pipeline.exec();
  
  // Find the highest overlap match
  for (let i = 0; i < combinations.length; i++) {
    const candidates = results[i];
    if (candidates && candidates.length > 0) {
      // Filter out self
      const validCandidates = candidates.filter(id => id !== userId);
      if (validCandidates.length > 0) {
        // Select a random candidate from the matches
        const candidate = validCandidates[Math.floor(Math.random() * validCandidates.length)];
        
        // Atomically ensure candidate is still active and remove both
        const isActive = await redisClient.sIsMember('seekers', candidate);
        if (isActive) {
          const sharedInterests = combinations[i];
          await removeUserFromMatchingPool(candidate);
          // Make sure self is not left in seekers
          await removeUserFromMatchingPool(userId);
          
          return {
            candidateId: candidate,
            sharedCount: sharedInterests.length,
            sharedInterests
          };
        }
      }
    }
  }
  
  // If no interest match, fallback to random matching
  const fallbackCandidate = await getRandomSeeker(userId);
  if (fallbackCandidate) {
    await removeUserFromMatchingPool(fallbackCandidate);
    await removeUserFromMatchingPool(userId);
    return { candidateId: fallbackCandidate, sharedCount: 0, sharedInterests: [] };
  }
  
  // No match found at all, add self to the queue
  await addUserToMatchingPool(userId, cleanInterests);
  return null;
};

/**
 * Get a random user from the seekers set who is not the given userId.
 */
const getRandomSeeker = async (userId) => {
  const seekers = await redisClient.sMembers('seekers');
  const validSeekers = seekers.filter(id => id !== userId);
  if (validSeekers.length === 0) return null;
  return validSeekers[Math.floor(Math.random() * validSeekers.length)];
};
