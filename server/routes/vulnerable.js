import express from 'express';

const router = express.Router();

function busyWaitNs(targetNs){
    if (targetNs <= 0n) return;
    const start = process.hrtime.bigint();
    while(process.hrtime.bigint() - start < targetNs){
        //cpu spin, faster than setTimeout function
    }
}

function naiveCompare(a, b, amplificationNs){ //compares two strings
    if(a.length !== b.length) return false;

    for(let i = 0; i < a.length; i++){
        if (a[i] !== b[i]) return false; //early exit leak
        busyWaitNs(amplificationNs); //amplification of the leak, the time is longer
    }

    return true;
}

router.post('/verify', (req, res) => {
    const { guess } = req.body;
    const secret = req.app.locals.secret;
    const amp = BigInt(req.query.amp ?? 0);

    let guessBuf;
    try{ guessBuf = Buffer.from(guess, 'hex'); }
    catch { return res.status(400).json({error: 'invalid hex'}); }

    const start = process.hrtime.bigint();
    const ok = naiveCompare(guessBuf, secret, amp);
    const elapsedNs = (process.hrtime.bigint() - start).toString(); //no network error

    res.json({ok, elapsedNs});
});

export default router;