// Two recorded tap patterns, with invented names for shipped regression tests.
export const operator = () => ({
  name:'Sample Person',sentence:'I help companies put AI to work in the jobs they already do',heroPhrase:'AI',
  body:'Sample: Start with the work, try a useful change, and keep what helps.',
  words:[{word:'Builder',not:'consultant'},{word:'Plain',not:'academic'},{word:'Candid',not:'hyped'},{word:'Alongside',not:'above'}],
  taps:{mode:'dark',feel:'engineered',history:'established-current',strength:'strong-solid',technology:'craftsman',style:'lululemon',posture:'tesla',mood:'restoration-hardware',place:'design-workshop'},off:[],looks:[],kept:{}
});
export const firstStrategy = () => ({...operator(),name:'Sample Organisation',
  sentence:'We help companies of 50 to 500 people build AI into the work they already do',
  words:[{word:'Practical',not:'theoretical'},{word:'Calm',not:'hyped'},{word:'Useful',not:'decorative'}],
  taps:{mode:'dark',feel:'suit-and-tie',history:'established-current',strength:'balanced',technology:'apple',style:'lululemon',posture:'tesla',mood:'restoration-hardware',place:'design-workshop'}
});

// Reconstructed from the words reported of the operator's bakery run; not a recorded answer set.
export const bakery = () => ({...operator(),name:"Rowan's Fancy Bakery",
  sentence:"I run Rowan's Fancy Bakery, where I start at 3:00 a.m. so your bread is ready when you are.",heroPhrase:'your bread',
  words:[{word:'Fancy',not:'snooty'},{word:'Friendly',not:'fussy'},{word:'Cheerful',not:'tired'}],
  taps:{mode:'light',feel:'playful-creative',history:'established-current',strength:'soft-graceful',technology:'kitchenaid',style:'j-crew',posture:'toyota',mood:'anthropologie',place:'coffee-shop'}
});

// Invented law-firm sample; not a recorded answer set.
export const lawFirm = () => ({...operator(),type:'org',name:'Hale Brandt Law',
  sentence:'We run Hale Brandt Law, a small practice that answers your call the same day and explains every step in plain words.',heroPhrase:'plain words',
  words:[{word:'Trusted',not:'stuffy'},{word:'Clear',not:'cold'},{word:'Steady',not:'slow'}],
  taps:{mode:'light',feel:'suit-and-tie',history:'rooted',strength:'strong-solid',technology:'craftsman',style:'brooks-brothers',posture:'ford',mood:'restoration-hardware',place:'hotel-lobby'}
});

// The one-pick action is allowed below min: 2; the other actions cover zero
// and two/three picks, exactly as the sitting's looks card does.
export const lookActions = () => [
  {value:'none',label:'None of these work',needs:'none',note:'Show me different looks'},
  {value:'one',label:'Only this one works for me',needs:'one',note:'and make my boards'},
  {value:'use',label:'Use these',needs:'some',note:'and make my boards'}
];

// Round 2 run 4's warm/natural taps; invented name and content stay in operator().
export const harbor = () => ({...operator(),type:'org',name:'Sample Clinic',
  taps:{mode:'light',feel:'natural',history:'established-current',strength:'soft-graceful',technology:'apple',style:'patagonia',posture:'toyota',mood:'anthropologie',place:'spa'}
});

// Board commands require explicit whole-look history, even when no looks ran.
export const boardOperator = () => ({...operator(), looksShown: []});
export const boardFirstStrategy = () => ({...firstStrategy(), looksShown: []});
export const boardHarbor = () => ({...harbor(), looksShown: []});
export const looksAnswers = ({looksShown, ...answers}) => answers;
