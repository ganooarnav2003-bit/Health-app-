// Translations: page title and description.   Columns: [English, हिन्दी, Hinglish]
(function (root) {
  const rows = [
    ['My Fitness Buddy: your daily health companion', 'माय फ़िटनेस बडी: आपका रोज़ का सेहत-साथी', 'My Fitness Buddy: aapka roz ka sehat saathi'],
    ['Say your day in your own words. My Fitness Buddy logs it, adapts your walking goal, tracks steps, water, calories and protein, and nudges you gently. Chat with Buddy Guide, your AI health assistant.', 'अपना दिन अपने शब्दों में बताइए। माय फ़िटनेस बडी उसे दर्ज करता है, आपका सैर का लक्ष्य आपके हिसाब से बदलता है, कदम, पानी, कैलोरी और प्रोटीन गिनता है और हल्के से याद दिलाता है। अपने एआई सेहत सहायक बडी गाइड से बात करें।', 'Apna din apne shabdon mein bataiye. My Fitness Buddy use record karta hai, aapka walking goal aapke hisaab se badalta hai, kadam, paani, calories aur protein ginta hai aur halke se yaad dilata hai. Apne AI sehat assistant Buddy Guide se baat karein.'],
  ];
  if (typeof module === 'object' && module.exports) module.exports = rows; else (root.HealthStrings = root.HealthStrings || []).push(...rows);
})(typeof self !== 'undefined' ? self : this);
