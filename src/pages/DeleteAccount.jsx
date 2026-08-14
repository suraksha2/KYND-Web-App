import {
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonNote,
  IonButton,
  IonCard,
  IonCardContent,
} from '@ionic/react'
import {
  personCircleOutline,
  mailOutline,
  warningOutline,
} from 'ionicons/icons'
import PageHero from '../components/PageHero'

export default function DeleteAccount() {
  return (
    <div>
      <PageHero
        title="Delete your Kynd account"
        subtitle="We're sorry to see you go."
      />
      <section className="py-14">
        <div className="max-w-3xl mx-auto px-6">
          <IonCard className="rounded-2xl">
            <IonCardContent>
              <p className="mb-3 font-semibold text-charcoal">
                To delete your Kynd account and associated data, please follow
                either of the steps below:
              </p>

              <IonList lines="full">
                <IonItem>
                  <IonIcon icon={personCircleOutline} slot="start" color="success" />
                  <IonLabel className="ion-text-wrap">
                    <h3>In-app</h3>
                    <p>Open the Kynd app → Profile → Settings → Delete account.</p>
                  </IonLabel>
                </IonItem>
                <IonItem href="mailto:help@kynd.sg">
                  <IonIcon icon={mailOutline} slot="start" color="success" />
                  <IonLabel className="ion-text-wrap">
                    <h3>Email request</h3>
                    <p>
                      Write to <strong>help@kynd.sg</strong> from the email
                      registered with your account.
                    </p>
                  </IonLabel>
                </IonItem>
              </IonList>

              <IonItem lines="none" className="mt-4">
                <IonIcon icon={warningOutline} slot="start" color="warning" />
                <IonNote className="ion-text-wrap">
                  Account deletion removes your profile, addresses and booking
                  history within 7 working days. Some transactional and tax
                  records are retained as required by law.
                </IonNote>
              </IonItem>

              <IonButton
                expand="block"
                color="danger"
                href="mailto:help@kynd.sg?subject=Delete%20my%20Kynd%20account"
                className="mt-4"
              >
                Request account deletion
              </IonButton>
            </IonCardContent>
          </IonCard>
        </div>
      </section>
    </div>
  )
}
