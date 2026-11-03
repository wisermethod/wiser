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
