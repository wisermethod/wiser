// Two recorded tap patterns, with invented names for shipped regression tests.
export const operator = () => ({
  name:'Sample Person',sentence:'I help companies put AI to work in the jobs they already do',heroPhrase:'AI',
  body:'Sample: Start with the work, try a useful change, and keep what helps.',
  words:[{word:'Builder',not:'consultant'},{word:'Plain',not:'academic'},{word:'Candid',not:'hyped'},{word:'Alongside',not:'above'}],
  taps:{mode:'dark',feel:'mechanical',history:'established-current',strength:'strong-solid',technology:'craftsman',style:'lululemon',posture:'tesla',mood:'restoration-hardware',place:'design-studio'},off:[],looks:[],kept:{}
});
export const firstStrategy = () => ({...operator(),name:'Sample Organisation',
  sentence:'We help companies of 50 to 500 people build AI into the work they already do',
  words:[{word:'Practical',not:'theoretical'},{word:'Calm',not:'hyped'},{word:'Useful',not:'decorative'}],
  taps:{mode:'dark',feel:'suit-and-tie',history:'established-current',strength:'balanced',technology:'apple',style:'lululemon',posture:'tesla',mood:'restoration-hardware',place:'design-studio'}
});
