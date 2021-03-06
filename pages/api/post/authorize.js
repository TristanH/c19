import db from '../../../db';
import rollbar from '../../../rollbar';
import { sendSMS } from '../../../twilio';
import smsContent from '../../../content/sms';
const secret = process.env.SECRET;

export default async (req, res) => {
  try {
    if (req.method === 'POST') {
      const { phone, language } = req.body;
      const code = await db.task(async t => {
        let person = await db.oneOrNone(
          `SELECT *,
              PGP_SYM_DECRYPT(phone::bytea, $/secret/) as phone,
              PGP_SYM_DECRYPT(code::bytea, $/secret/) as code
            FROM person
            WHERE PGP_SYM_DECRYPT(phone::bytea, $/secret/) = $/phone/`,
          { phone, secret }
        );
        if (!person) {
          person = await db.one(
            `INSERT INTO person (
                phone,
                code
              ) values (
                PGP_SYM_ENCRYPT($/phone/, $/secret/),
                PGP_SYM_ENCRYPT($/code/, $/secret/)
              )
              RETURNING *`,
            { phone, secret, code: Math.floor(100000 + Math.random() * 900000).toString() }
          );
        }
        return person.code;
      });

      await sendSMS({ body: smsContent[language || 'en-UK'].authCode + code, to: phone });

      res.status(200).end();
    } else res.status(502).end();
  } catch (error) {
    console.error(error);
    rollbar.error(error);
    res.status(500).end();
  }
};
